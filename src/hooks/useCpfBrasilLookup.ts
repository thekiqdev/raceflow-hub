import { useCallback, useEffect, useRef, useState } from "react";
import { checkCpfRegisteredRequest, lookupCpfRequest, type LookupCpfData } from "@/lib/api/auth";
import { validateCpf } from "@/lib/utils/validators";

export const CPF_LOOKUP_DEBOUNCE_MS = 400;

export interface UseCpfBrasilLookupOptions {
  cpfMasked: string;
  onSuccess: (data: LookupCpfData, proof: string) => void;
  /** CPF alterado após sucesso ou lookup inválido — limpar campos bloqueados */
  onInvalidate: () => void;
  /**
   * Se definido, a consulta automática (debounce ao completar 11 dígitos) só roda quando retorna true.
   * Ex.: exigir data de nascimento preenchida antes de consultar.
   */
  canAutoLookup?: () => boolean;
}

/**
 * Debounce + busca manual + cancelamento via AbortController.
 * Dispara consulta automática quando há 11 dígitos e CPF válido (algoritmo).
 */
const MSG_CPF_JA_CADASTRO =
  "Este CPF já possui cadastro na Cronoteam. Se for sua conta, recupere sua senha.";

const MSG_CPF_INVALIDO_DIGITOS = "CPF inválido. Verifique os dígitos.";

const MSG_CONSULTA_FALHOU = "Não foi possível consultar o CPF. Tente novamente.";

export function useCpfBrasilLookup({
  cpfMasked,
  onSuccess,
  onInvalidate,
  canAutoLookup,
}: UseCpfBrasilLookupOptions) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [cpfAlreadyRegistered, setCpfAlreadyRegistered] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOkDigitsRef = useRef<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onInvalidateRef = useRef(onInvalidate);
  const canAutoLookupRef = useRef(canAutoLookup);

  onSuccessRef.current = onSuccess;
  onInvalidateRef.current = onInvalidate;
  canAutoLookupRef.current = canAutoLookup;

  /** Após sucesso da API, zera o estado “consulta OK” do hook (ex.: data de nascimento não bate). */
  const clearLookupCompleted = useCallback(() => {
    lastOkDigitsRef.current = null;
  }, []);

  const runLookup = useCallback(
    async (digits: string) => {
      if (digits.length !== 11) {
        return;
      }
      if (!validateCpf(digits)) {
        lastOkDigitsRef.current = null;
        onInvalidateRef.current();
        setCpfAlreadyRegistered(false);
        setLookupError(MSG_CPF_INVALIDO_DIGITOS);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLookupLoading(true);
      setLookupError(null);
      setCpfAlreadyRegistered(false);
      try {
        const checkRes = await checkCpfRegisteredRequest(digits, ac.signal);
        if (ac.signal.aborted) return;
        if (checkRes.success && checkRes.data?.registered === true) {
          lastOkDigitsRef.current = null;
          onInvalidateRef.current();
          setCpfAlreadyRegistered(true);
          setLookupError(MSG_CPF_JA_CADASTRO);
          return;
        }

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
        setLookupError(res.message || MSG_CPF_INVALIDO_DIGITOS);
      } catch {
        if (!ac.signal.aborted) {
          lastOkDigitsRef.current = null;
          onInvalidateRef.current();
          setLookupError(MSG_CONSULTA_FALHOU);
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
      setCpfAlreadyRegistered(false);
    }

    if (digits.length < 11) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setLookupError(null);
      setCpfAlreadyRegistered(false);
      return;
    }

    if (digits.length === 11 && !validateCpf(cpfMasked)) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastOkDigitsRef.current = null;
      onInvalidateRef.current();
      setLookupError(MSG_CPF_INVALIDO_DIGITOS);
      setCpfAlreadyRegistered(false);
      return;
    }

    if (canAutoLookupRef.current && !canAutoLookupRef.current()) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
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
    cpfAlreadyRegistered,
    clearLookupCompleted,
  };
}
