import { useCallback, useEffect, useRef, useState } from "react";
import { lookupCpfRequest, type LookupCpfData } from "@/lib/api/auth";
import { validateCpf } from "@/lib/utils/validators";

export const CPF_LOOKUP_DEBOUNCE_MS = 400;

export interface UseCpfBrasilLookupOptions {
  cpfMasked: string;
  onSuccess: (data: LookupCpfData, proof: string) => void;
  /** CPF alterado após sucesso ou lookup inválido — limpar campos bloqueados */
  onInvalidate: () => void;
}

/**
 * Debounce + busca manual + cancelamento via AbortController.
 * Dispara consulta automática quando há 11 dígitos e CPF válido (algoritmo).
 */
export function useCpfBrasilLookup({ cpfMasked, onSuccess, onInvalidate }: UseCpfBrasilLookupOptions) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOkDigitsRef = useRef<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onInvalidateRef = useRef(onInvalidate);

  onSuccessRef.current = onSuccess;
  onInvalidateRef.current = onInvalidate;

  const runLookup = useCallback(
    async (digits: string) => {
      if (digits.length !== 11 || !validateCpf(digits)) {
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLookupLoading(true);
      setLookupError(null);
      try {
        const res = await lookupCpfRequest(digits, ac.signal);
        if (ac.signal.aborted) return;
        if (res.success && res.data && res.proof) {
          lastOkDigitsRef.current = digits;
          onSuccessRef.current(res.data, res.proof);
          setLookupError(null);
          return;
        }
        lastOkDigitsRef.current = null;
        onInvalidateRef.current();
        setLookupError(res.message || "CPF inválido");
      } catch {
        if (!ac.signal.aborted) {
          lastOkDigitsRef.current = null;
          onInvalidateRef.current();
          setLookupError("CPF inválido");
        }
      } finally {
        if (!ac.signal.aborted) {
          setLookupLoading(false);
        }
      }
    },
    []
  );

  const manualLookup = useCallback(() => {
    const digits = cpfMasked.replace(/\D/g, "");
    void runLookup(digits);
  }, [cpfMasked, runLookup]);

  useEffect(() => {
    const digits = cpfMasked.replace(/\D/g, "");

    if (lastOkDigitsRef.current && digits !== lastOkDigitsRef.current) {
      lastOkDigitsRef.current = null;
      onInvalidateRef.current();
      setLookupError(null);
    }

    if (digits.length !== 11 || !validateCpf(cpfMasked)) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (digits.length < 11) {
        setLookupError(null);
      }
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runLookup(digits);
    }, CPF_LOOKUP_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [cpfMasked, runLookup]);

  return {
    lookupLoading,
    lookupError,
    manualLookup,
  };
}
