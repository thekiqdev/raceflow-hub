import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  UserCog,
  Copy,
  ExternalLink,
  Users,
  DollarSign,
  TrendingUp,
  Loader2,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Gift,
  Send,
  QrCode,
  Download,
  MapPin,
  User,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyGroupLeader,
  getMyReferrals,
  getMyCommissions,
  getMyStats,
  type GroupLeader,
  type UserReferral,
  type LeaderCommission,
} from "@/lib/api/groupLeaders";
import { getMyEventCommissions, type LeaderEventCommission } from "@/lib/api/leaderEventCommissions";
import { getMyCouponRegistrations, type LeaderRegistration } from "@/lib/api/leaderRegistrations";
import { getMyInvitations, sendInvitation, resendInvitationEmail, getInvitationRegistration, type LeaderInvitation, type SendInvitationData } from "@/lib/api/leaderInvitations";
import { type Registration } from "@/lib/api/registrations";
import { getPublicProfileByCpf, type Profile } from "@/lib/api/profiles";
import { maskCpf, maskPhone, unmask } from "@/lib/utils/masks";
import { validateCpf } from "@/lib/utils/validators";
import { createRegistrationByLeader } from "@/lib/api/registrations";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateOnlyBrasilia, formatDateTimeBrasilia } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";

export function LeaderDashboard() {
  const [loading, setLoading] = useState(true);
  const [leader, setLeader] = useState<GroupLeader | null>(null);
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [commissions, setCommissions] = useState<LeaderCommission[]>([]);
  const [eventCommissions, setEventCommissions] = useState<LeaderEventCommission[]>([]);
  const [couponRegistrations, setCouponRegistrations] = useState<LeaderRegistration[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [commissionEventSearchTerm, setCommissionEventSearchTerm] = useState("");
  const [commissionUserSearchTerm, setCommissionUserSearchTerm] = useState<Record<string, string>>({});
  const [invitations, setInvitations] = useState<LeaderInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [sendInvitationDialogOpen, setSendInvitationDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<LeaderInvitation | null>(null);
  const [runnerCpf, setRunnerCpf] = useState("");
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [resendingInvitationId, setResendingInvitationId] = useState<string | null>(null);
  const [invitationTicketInvitationId, setInvitationTicketInvitationId] = useState<string | null>(null);
  const [invitationTicketRegistration, setInvitationTicketRegistration] = useState<Registration | null>(null);
  const [loadingInvitationTicket, setLoadingInvitationTicket] = useState(false);
  const [inviteStep, setInviteStep] = useState<1 | 2>(1);
  const [inviteCpfLookupLoading, setInviteCpfLookupLoading] = useState(false);
  const [inviteAthleteFound, setInviteAthleteFound] = useState<boolean | null>(null);
  const [inviteAthleteData, setInviteAthleteData] = useState<Profile | null>(null);
  const [inviteRunnerFormData, setInviteRunnerFormData] = useState({
    full_name: "",
    birth_date: "",
    city: "",
    gender: "",
    team: "",
    email: "",
    phone: "",
  });
  const [inviteRunnerFormErrors, setInviteRunnerFormErrors] = useState<Record<string, string>>({});
  const [inviteCpfError, setInviteCpfError] = useState("");
  const [inviteApiError, setInviteApiError] = useState("");
  // Etapa 3: opção "deixar corredor escolher" e seleção categoria/modalidade/kit
  const [inviteRunnerChoosesCategoryModalityKit, setInviteRunnerChoosesCategoryModalityKit] = useState(true);
  const [inviteCategoryId, setInviteCategoryId] = useState("");
  const [inviteModalityId, setInviteModalityId] = useState("");
  const [inviteKitId, setInviteKitId] = useState("");
  const [inviteVariantSelections, setInviteVariantSelections] = useState<Record<string, string>>({});
  const [inviteCategories, setInviteCategories] = useState<Category[]>([]);
  const [inviteModalities, setInviteModalities] = useState<Modality[]>([]);
  const [inviteKits, setInviteKits] = useState<EventKit[]>([]);
  const [loadingInviteOptions, setLoadingInviteOptions] = useState(false);
  const [stats, setStats] = useState<{
    total_referrals: number;
    total_registrations: number;
    total_commissions: number;
    pending_commissions: number;
    paid_commissions: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  
  // States for register athlete dialog
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [selectedEventForRegistration, setSelectedEventForRegistration] = useState<string>("");
  const [selectedCommissionId, setSelectedCommissionId] = useState<string>(""); // NOVO: ID da comissão específica
  const [selectedModalityId, setSelectedModalityId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [loadingModalities, setLoadingModalities] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingKits, setLoadingKits] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadLeaderData();
  }, []);

  const loadLeaderData = async () => {
    try {
      setLoading(true);
      const [leaderResponse, referralsResponse, commissionsResponse, statsResponse, eventCommissionsResponse] = await Promise.all([
        getMyGroupLeader(),
        getMyReferrals(),
        getMyCommissions(),
        getMyStats(),
        getMyEventCommissions(),
      ]);

      if (leaderResponse.success && leaderResponse.data) {
        setLeader(leaderResponse.data);
      }

      if (referralsResponse.success && referralsResponse.data) {
        setReferrals(referralsResponse.data);
      }

      if (commissionsResponse.success && commissionsResponse.data) {
        setCommissions(commissionsResponse.data);
      }

      if (statsResponse.success && statsResponse.data?.stats) {
        setStats(statsResponse.data.stats);
      }

      if (eventCommissionsResponse.success && eventCommissionsResponse.data) {
        setEventCommissions(eventCommissionsResponse.data);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados do líder:", error);
      if (error.message?.includes("not a group leader")) {
        // Usuário não é líder, não mostrar erro
        return;
      }
      toast.error("Erro ao carregar dados do líder");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/cadastro?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Load modalities, categories and kits when event is selected
  useEffect(() => {
    if (selectedEventForRegistration) {
      loadModalities();
      loadCategories();
      loadKits();
    } else {
      setModalities([]);
      setCategories([]);
      setKits([]);
      setSelectedModalityId("");
      setSelectedCategoryId("");
      setSelectedKitId("");
    }
  }, [selectedEventForRegistration]);

  // Load categories when modality is selected
  useEffect(() => {
    if (selectedModalityId) {
      loadCategoriesByModality();
    } else if (selectedEventForRegistration) {
      loadCategories();
    }
    setSelectedCategoryId("");
  }, [selectedModalityId]);

  // Etapa 3: carregar categorias, modalidades e kits do evento ao abrir o dialog de enviar convite
  useEffect(() => {
    if (!sendInvitationDialogOpen || !selectedInvitation?.event_id) {
      setInviteCategories([]);
      setInviteModalities([]);
      setInviteKits([]);
      return;
    }
    const eventId = selectedInvitation.event_id;
    let cancelled = false;
    const load = async () => {
      setLoadingInviteOptions(true);
      try {
        const [catRes, modRes, kitsRes] = await Promise.all([
          getCategories(eventId),
          getModalities(eventId),
          getEventKits(eventId),
        ]);
        if (cancelled) return;
        if (catRes.success && catRes.data) setInviteCategories(catRes.data);
        if (modRes.success && modRes.data) setInviteModalities(modRes.data);
        if (kitsRes.success && kitsRes.data) setInviteKits(kitsRes.data);
      } catch (e) {
        if (!cancelled) toast.error("Erro ao carregar opções do evento.");
      } finally {
        if (!cancelled) setLoadingInviteOptions(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [sendInvitationDialogOpen, selectedInvitation?.event_id]);

  // Recarregar kits do convite quando a categoria mudar (filtrar por categoria)
  useEffect(() => {
    if (!sendInvitationDialogOpen || !selectedInvitation?.event_id) return;
    const eventId = selectedInvitation.event_id;
    let cancelled = false;
    const loadKitsForInvite = async () => {
      try {
        const res = await getEventKits(eventId, inviteCategoryId || undefined);
        if (cancelled) return;
        if (res.success && res.data) setInviteKits(res.data);
      } catch {
        if (!cancelled) setInviteKits([]);
      }
    };
    loadKitsForInvite();
    return () => { cancelled = true; };
  }, [sendInvitationDialogOpen, selectedInvitation?.event_id, inviteCategoryId]);

  const loadModalities = async () => {
    if (!selectedEventForRegistration) return;
    
    try {
      setLoadingModalities(true);
      const response = await getModalities(selectedEventForRegistration);
      if (response.success && response.data) {
        setModalities(response.data);
      }
    } catch (error) {
      console.error("Error loading modalities:", error);
      toast.error("Erro ao carregar modalidades");
    } finally {
      setLoadingModalities(false);
    }
  };

  const loadCategories = async () => {
    if (!selectedEventForRegistration) return;
    
    try {
      setLoadingCategories(true);
      const response = await getCategories(selectedEventForRegistration);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCategoriesByModality = async () => {
    if (!selectedModalityId) return;
    
    try {
      setLoadingCategories(true);
      const { getCategoriesByModality } = await import("@/lib/api/categories");
      const response = await getCategoriesByModality(selectedModalityId);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error loading categories by modality:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadKits = async () => {
    if (!selectedEventForRegistration) return;
    
    try {
      setLoadingKits(true);
      const response = await getEventKits(selectedEventForRegistration);
      if (response.success && response.data) {
        setKits(response.data);
      }
    } catch (error) {
      console.error("Error loading kits:", error);
      toast.error("Erro ao carregar kits");
    } finally {
      setLoadingKits(false);
    }
  };

  const handleOpenRegisterDialog = (eventId: string, commissionId?: string) => {
    setSelectedEventForRegistration(eventId);
    setSelectedCommissionId(commissionId || ""); // NOVO: armazenar ID da comissão
    setIsRegisterDialogOpen(true);
    setRegisterEmail("");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
  };

  const handleCloseRegisterDialog = () => {
    setIsRegisterDialogOpen(false);
    setRegisterEmail("");
    setSelectedEventForRegistration("");
    setSelectedCommissionId(""); // NOVO: limpar ID da comissão
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
  };

  const handleRegisterAthlete = async () => {
    if (!registerEmail || !selectedEventForRegistration || !selectedCategoryId) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registerEmail)) {
      toast.error("Email inválido");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createRegistrationByLeader({
        email: registerEmail,
        event_id: selectedEventForRegistration,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
        commission_id: selectedCommissionId || undefined,
      });

      if (response.success) {
        toast.success("Atleta inscrito com sucesso!");
        handleCloseRegisterDialog();
        // Reload leader data to update stats
        loadLeaderData();
      } else {
        toast.error(response.error || "Erro ao inscrever atleta");
      }
    } catch (error: any) {
      console.error("Error registering athlete:", error);
      toast.error(error.message || "Erro ao inscrever atleta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Group commissions by event
  const commissionsByEvent = useMemo(() => {
    const grouped: Record<string, LeaderCommission[]> = {};
    (commissions || []).forEach((commission) => {
      const eventId = commission.event_id;
      if (!grouped[eventId]) {
        grouped[eventId] = [];
      }
      grouped[eventId].push(commission);
    });
    return grouped;
  }, [commissions]);

  // Get unique events with statistics
  const eventsWithStats = useMemo(() => {
    const eventMap = new Map<string, {
      event_id: string;
      event_title: string;
      commissions: LeaderCommission[];
      totalCommissions: number;
      totalAmount: number;
      pendingAmount: number;
      paidAmount: number;
      pendingCount: number;
      paidCount: number;
    }>();

    (commissions || []).forEach((commission) => {
      const eventId = commission.event_id;
      const eventTitle = commission.event_title || "N/A";

      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event_id: eventId,
          event_title: eventTitle,
          commissions: [],
          totalCommissions: 0,
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          pendingCount: 0,
          paidCount: 0,
        });
      }

      const event = eventMap.get(eventId)!;
      event.commissions.push(commission);
      event.totalCommissions++;
      
      const commissionAmount = typeof commission.commission_amount === 'string' 
        ? parseFloat(commission.commission_amount) 
        : (commission.commission_amount || 0);
      const amount = isNaN(commissionAmount) ? 0 : commissionAmount;
      
      event.totalAmount += amount;

      if (commission.status === "pending") {
        event.pendingAmount += amount;
        event.pendingCount++;
      } else if (commission.status === "paid") {
        event.paidAmount += amount;
        event.paidCount++;
      }
    });

    return Array.from(eventMap.values()).sort((a, b) => {
      // Sort by most recent commission date
      const aLatest = a.commissions.sort((c1, c2) => 
        new Date(c2.created_at).getTime() - new Date(c1.created_at).getTime()
      )[0];
      const bLatest = b.commissions.sort((c1, c2) => 
        new Date(c2.created_at).getTime() - new Date(c1.created_at).getTime()
      )[0];
      return new Date(bLatest.created_at).getTime() - new Date(aLatest.created_at).getTime();
    });
  }, [commissions || []]);

  // Filter events by search term
  const filteredCommissionEvents = useMemo(() => {
    if (!commissionEventSearchTerm.trim()) {
      return eventsWithStats;
    }
    const searchLower = commissionEventSearchTerm.toLowerCase();
    return eventsWithStats.filter((event) =>
      event.event_title.toLowerCase().includes(searchLower)
    );
  }, [eventsWithStats, commissionEventSearchTerm]);

  // Filter commissions by user search term for a specific event
  const getFilteredCommissionsForEvent = (eventId: string) => {
    const eventCommissions = commissionsByEvent[eventId] || [];
    const searchTerm = commissionUserSearchTerm[eventId] || "";
    
    if (!searchTerm.trim()) {
      return eventCommissions;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return eventCommissions.filter((commission) => {
      const userName = commission.referred_user_name || "";
      const userEmail = commission.referred_user_email || "";
      return (
        userName.toLowerCase().includes(searchLower) ||
        userEmail.toLowerCase().includes(searchLower)
      );
    });
  };

  const loadCouponRegistrations = async () => {
    setLoadingRegistrations(true);
    try {
      const filters: {
        event_id?: string;
        payment_status?: 'pending' | 'paid' | 'cancelled';
      } = {};
      
      if (selectedEventId && selectedEventId !== "all") {
        filters.event_id = selectedEventId;
      }
      
      if (paymentStatusFilter && paymentStatusFilter !== "all") {
        filters.payment_status = paymentStatusFilter as 'pending' | 'paid' | 'cancelled';
      }
      
      const response = await getMyCouponRegistrations(filters);
      console.log('📊 Resposta completa:', response);
      if (response.success && response.data) {
        // Backend retorna { data: { data: registrations, count: number } }
        const registrations = (response.data as any)?.data || [];
        console.log('📊 Registrações carregadas:', registrations.length, registrations);
        setCouponRegistrations(registrations);
      } else {
        console.error('❌ Erro ao carregar registrações:', response.error);
      }
    } catch (error) {
      console.error("Erro ao carregar registrações:", error);
      toast.error("Erro ao carregar registrações");
    } finally {
      setLoadingRegistrations(false);
    }
  };

  useEffect(() => {
    if (leader) {
      loadCouponRegistrations();
      loadInvitations();
    }
  }, [selectedEventId, paymentStatusFilter, leader]);

  const loadInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const response = await getMyInvitations();
      if (response.success && response.data) {
        setInvitations(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar convites:", error);
      toast.error("Erro ao carregar convites");
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleOpenSendDialog = (invitation: LeaderInvitation) => {
    setSelectedInvitation(invitation);
    setRunnerCpf("");
    setInviteStep(1);
    setInviteCpfLookupLoading(false);
    setInviteAthleteFound(null);
    setInviteAthleteData(null);
    setInviteRunnerFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
    setInviteRunnerFormErrors({});
    setInviteCpfError("");
    setInviteApiError("");
    setInviteRunnerChoosesCategoryModalityKit(true);
    setInviteCategoryId("");
    setInviteModalityId("");
    setInviteKitId("");
    setInviteVariantSelections({});
    setSendInvitationDialogOpen(true);
  };

  const handleInviteCpfLookup = async () => {
    const clean = unmask(runnerCpf);
    if (clean.length !== 11) {
      setInviteCpfError("CPF deve ter 11 dígitos.");
      return;
    }
    if (!validateCpf(runnerCpf)) {
      setInviteCpfError("CPF inválido. Verifique os dígitos.");
      return;
    }
    setInviteCpfError("");
    setInviteApiError("");
    setInviteCpfLookupLoading(true);
    try {
      const response = await getPublicProfileByCpf(runnerCpf);
      if (response.success && response.data) {
        setInviteAthleteFound(true);
        setInviteAthleteData(response.data);
      } else {
        setInviteAthleteFound(false);
        setInviteAthleteData(null);
      }
      setInviteStep(2);
    } catch {
      setInviteAthleteFound(false);
      setInviteAthleteData(null);
      setInviteStep(2);
    } finally {
      setInviteCpfLookupLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!selectedInvitation) return;
    const cleanCpf = unmask(runnerCpf);
    if (cleanCpf.length !== 11) {
      toast.error("CPF inválido.");
      return;
    }
    if (!validateCpf(runnerCpf)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }

    if (inviteAthleteFound === false) {
      const err: Record<string, string> = {};
      if (!inviteRunnerFormData.full_name?.trim()) err.full_name = "Nome completo é obrigatório";
      if (!inviteRunnerFormData.birth_date?.trim()) err.birth_date = "Data de nascimento é obrigatória";
      if (!inviteRunnerFormData.city?.trim()) err.city = "Cidade é obrigatória";
      if (!inviteRunnerFormData.gender?.trim()) err.gender = "Sexo é obrigatório";
      setInviteRunnerFormErrors(err);
      if (Object.keys(err).length > 0) {
        toast.error("Preencha os campos obrigatórios para pré-cadastro.");
        return;
      }
    }

    if (!inviteRunnerChoosesCategoryModalityKit) {
      if (!inviteCategoryId?.trim()) {
        toast.error("Selecione a categoria do convite.");
        return;
      }
      const kit = inviteKits.find((k) => k.id === inviteKitId);
      const variableProducts = (kit?.products || []).filter((p) => p.type === "variable" && (p.variants?.length ?? 0) > 0);
      for (const product of variableProducts) {
        if (!inviteVariantSelections[product.id]?.trim()) {
          toast.error(`Selecione o tamanho/variante para "${product.name}".`);
          return;
        }
      }
    }

    setInviteApiError("");
    setSendingInvitation(true);
    try {
      const payload: SendInvitationData = {
        invitation_id: selectedInvitation.id,
        runner_cpf: runnerCpf.trim(),
        runner_chooses_category_modality_kit: inviteRunnerChoosesCategoryModalityKit,
      };
      if (inviteAthleteFound === false) {
        payload.runner_data = {
          full_name: inviteRunnerFormData.full_name.trim(),
          birth_date: inviteRunnerFormData.birth_date.trim(),
          city: inviteRunnerFormData.city.trim(),
          gender: inviteRunnerFormData.gender.trim(),
          team: inviteRunnerFormData.team?.trim() || undefined,
          email: inviteRunnerFormData.email?.trim() || undefined,
          phone: inviteRunnerFormData.phone?.trim() || undefined,
        };
      }
      if (!inviteRunnerChoosesCategoryModalityKit) {
        payload.category_id = inviteCategoryId;
        if (inviteModalityId) payload.modality_id = inviteModalityId;
        if (inviteKitId) payload.kit_id = inviteKitId;
        if (Object.keys(inviteVariantSelections).length > 0) {
          payload.product_selections = Object.entries(inviteVariantSelections)
            .filter(([, variantId]) => variantId?.trim())
            .map(([product_id, variant_id]) => ({ product_id, variant_id }));
        }
      }
      const response = await sendInvitation(payload);

      if (response.success) {
        toast.success("Convite enviado com sucesso!");
        setSendInvitationDialogOpen(false);
        setSelectedInvitation(null);
        setRunnerCpf("");
        setInviteStep(1);
        setInviteAthleteFound(null);
        setInviteAthleteData(null);
        setInviteRunnerFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });

        if (selectedInvitation && response.data) {
          setInvitations(prev => prev.map(inv =>
            inv.id === selectedInvitation.id
              ? { ...inv, status: "sent" as const, runner_id: response.data!.runner_id ?? null, runner_cpf: response.data!.runner_cpf ?? cleanCpf, sent_at: response.data!.sent_at ?? new Date().toISOString() }
              : inv
          ));
        }
        setTimeout(() => loadInvitations(), 500);
      } else {
        setInviteApiError(response.error || "Erro ao enviar convite");
        toast.error(response.error || "Erro ao enviar convite");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || "Erro ao enviar convite";
      setInviteApiError(msg);
      toast.error(msg);
    } finally {
      setSendingInvitation(false);
    }
  };

  const handleResendInvitationEmail = async (invitationId: string) => {
    setResendingInvitationId(invitationId);
    try {
      const response = await resendInvitationEmail(invitationId);
      if (response.success) {
        toast.success("Email reenviado com sucesso.");
      } else {
        toast.error(response.error || response.message || "Erro ao reenviar email");
      }
    } catch (error: any) {
      const msg = error?.message || error?.error || "Erro ao reenviar email";
      toast.error(msg);
    } finally {
      setResendingInvitationId(null);
    }
  };

  const hasValidRunnerEmail = (invitation: LeaderInvitation) =>
    !!invitation.runner_email && !invitation.runner_email.includes("@temp.cronoteam");

  const openInvitationTicketModal = async (invitationId: string) => {
    setInvitationTicketInvitationId(invitationId);
    setInvitationTicketRegistration(null);
    setLoadingInvitationTicket(true);
    try {
      const response = await getInvitationRegistration(invitationId);
      if (response.success && response.data) {
        setInvitationTicketRegistration(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar ingresso");
        setInvitationTicketInvitationId(null);
      }
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar ingresso");
      setInvitationTicketInvitationId(null);
    } finally {
      setLoadingInvitationTicket(false);
    }
  };

  const closeInvitationTicketModal = () => {
    setInvitationTicketInvitationId(null);
    setInvitationTicketRegistration(null);
  };

  const handleDownloadInvitationReceipt = async (reg: Registration) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = margin;
      const confirmationCode = reg.confirmation_code || reg.id.substring(0, 8).toUpperCase();
      const validationUrl = `${window.location.origin}/registration/validate/${reg.id}`;
      const locationText =
        (reg as any).location ||
        `${(reg as any).city || ""}, ${(reg as any).state || ""}`.trim() ||
        "Local não informado";

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("COMPROVANTE DE INSCRIÇÃO", pageWidth / 2, yPos, { align: "center" });
      yPos += 12;

      doc.setFontSize(14);
      doc.text(reg.event_title || "Evento", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Código: ${confirmationCode}`, margin, yPos);
      yPos += 7;
      doc.text(
        `Data da Inscrição: ${reg.created_at ? format(new Date(reg.created_at), "dd/MM/yyyy", { locale: ptBR }) : "N/A"}`,
        margin,
        yPos
      );
      yPos += 12;

      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO EVENTO:", margin, yPos);
      yPos += 7;
      doc.setFont("helvetica", "normal");
      doc.text(`Evento: ${reg.event_title || "Evento"}`, margin, yPos);
      yPos += 6;
      doc.text(`Data: ${reg.event_date ? formatDateTimeBrasilia(reg.event_date) : "N/A"}`, margin, yPos);
      yPos += 6;
      doc.text(`Local: ${locationText}`, margin, yPos);
      yPos += 10;

      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO CORREDOR:", margin, yPos);
      yPos += 7;
      doc.setFont("helvetica", "normal");
      doc.text(`Nome: ${reg.runner_name || "N/A"}`, margin, yPos);
      yPos += 6;
      doc.text(`CPF: ${reg.runner_cpf ? maskCpf(reg.runner_cpf) : "N/A"}`, margin, yPos);
      yPos += 10;

      doc.setFont("helvetica", "bold");
      doc.text("DADOS DA INSCRIÇÃO:", margin, yPos);
      yPos += 7;
      doc.setFont("helvetica", "normal");
      doc.text(`Categoria: ${reg.category_name || "N/A"} ${reg.category_distance ? `(${reg.category_distance})` : ""}`, margin, yPos);
      yPos += 6;
      doc.text(`Kit: ${reg.kit_name || "Sem kit"}`, margin, yPos);
      yPos += 6;
      if (reg.product_selections && reg.product_selections.length > 0) {
        const productGroups = new Map<string, { product_name: string; attrs: string[] }>();
        reg.product_selections.forEach((sel: any) => {
          const key = sel.product_id;
          if (!productGroups.has(key)) {
            productGroups.set(key, { product_name: sel.product_name || "Produto", attrs: [] });
          }
          productGroups.get(key)!.attrs.push(`${sel.attribute_name}: ${sel.attribute_value}`);
        });
        productGroups.forEach((data) => {
          data.attrs.forEach((line) => {
            doc.text(line, margin, yPos);
            yPos += 5;
          });
        });
        yPos += 3;
      }
      doc.text(`Valor: R$ ${Number(reg.total_amount ?? 0).toFixed(2).replace(".", ",")}`, margin, yPos);
      yPos += 6;
      doc.text(
        `Status do Pagamento: ${reg.payment_status === "paid" ? "Pago" : (reg as any).payment_status === "convidado" ? "Convite" : "Pendente"}`,
        margin,
        yPos
      );
      yPos += 14;

      doc.setFont("helvetica", "bold");
      doc.text("QR CODE DE VALIDAÇÃO:", pageWidth / 2, yPos, { align: "center" });
      yPos += 8;

      try {
        const QRCodeLib = await import("qrcode");
        const qrCodeSize = 80;
        const qrCodeX = (pageWidth - qrCodeSize) / 2;
        const qrCodeDataUrl = await QRCodeLib.default.toDataURL(validationUrl, {
          width: qrCodeSize,
          margin: 2,
        });
        doc.addImage(qrCodeDataUrl, "PNG", qrCodeX, yPos, qrCodeSize, qrCodeSize);
        yPos += qrCodeSize + 8;
      } catch {
        doc.text("QR Code não disponível", pageWidth / 2, yPos, { align: "center" });
        yPos += 10;
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("Escaneie o QR Code para validar a inscrição no evento.", pageWidth / 2, yPos, { align: "center" });

      doc.save(`comprovante_${confirmationCode}.pdf`);
      toast.success("Comprovante baixado com sucesso!");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error("Erro ao baixar comprovante");
    }
  };

  const handleDownloadInvitationReceiptById = async (invitationId: string) => {
    try {
      const response = await getInvitationRegistration(invitationId);
      if (response.success && response.data) {
        await handleDownloadInvitationReceipt(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar ingresso");
      }
    } catch (error: any) {
      toast.error(error?.message || "Erro ao baixar comprovante");
    }
  };

  // Get unique events from event commissions (events with leader coupons)
  const uniqueEvents = Array.from(
    new Map(
      eventCommissions.map((ec) => [ec.event_id, { id: ec.event_id, title: ec.event_title || "Evento" }])
    ).values()
  );

  // Filter events by search
  const filteredEvents = uniqueEvents.filter((event) =>
    event.title.toLowerCase().includes(eventSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!leader) {
    return null; // Não é líder, não mostrar nada
  }

  const referralLink = `${window.location.origin}/cadastro?ref=${leader.referral_code}`;
  const pendingCommissions = (commissions || []).filter((c) => c.status === "pending");
  const paidCommissions = (commissions || []).filter((c) => c.status === "paid");
  const totalPending = pendingCommissions.reduce((sum, c) => {
    const amount = typeof c.commission_amount === 'string' ? parseFloat(c.commission_amount) : (c.commission_amount || 0);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  const totalPaid = paidCommissions.reduce((sum, c) => {
    const amount = typeof c.commission_amount === 'string' ? parseFloat(c.commission_amount) : (c.commission_amount || 0);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <div className="flex items-center gap-3 mb-2">
          <UserCog className="h-6 w-6 text-white" />
          <h1 className="text-2xl font-bold text-white">Líder de Grupo</h1>
        </div>
        <p className="text-white/80 text-sm">
          Gerencie seu código de referência e acompanhe suas comissões
        </p>
      </div>

      {/* Overview Cards */}
      <div className="px-4 mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Referências</div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-primary">
                {stats?.total_referrals || leader.total_referrals || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Ganhos Totais</div>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(leader.total_earnings)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral Code Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <div className="mb-4">
              <h3 className="font-semibold mb-1">Seu Código de Referência</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Compartilhe este código ou link para ganhar comissões
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Código</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-4 py-3 rounded-lg text-lg font-mono font-bold text-center">
                    {leader.referral_code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyCode(leader.referral_code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Link de Referência</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-4 py-2 rounded-lg text-xs font-mono truncate">
                    {referralLink}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(leader.referral_code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={leader.is_active ? "default" : "secondary"}>
                    {leader.is_active ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Ativo
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-1 h-3 w-3" />
                        Inativo
                      </>
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Comissões Pendentes</div>
                <TrendingUp className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="text-xl font-bold text-yellow-600">
                {formatCurrency(totalPending)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {pendingCommissions.length} comissão(ões)
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Comissões Pagas</div>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(totalPaid)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {paidCommissions.length} comissão(ões)
              </div>
            </CardContent>
          </Card>
        </div>

         {/* Tabs */}
         <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
           <TabsList className="flex flex-wrap w-full gap-1.5 md:gap-2 p-1.5 md:p-2 h-auto">
             <TabsTrigger value="referrals" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Referências ({referrals.length})
             </TabsTrigger>
             <TabsTrigger value="commissions" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Comissões ({commissions.length})
             </TabsTrigger>
             <TabsTrigger value="event-commissions" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Links de Eventos ({eventCommissions.length})
             </TabsTrigger>
             <TabsTrigger value="purchases" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Compras ({couponRegistrations.filter((r) => r.status !== "cancelled").length})
             </TabsTrigger>
             <TabsTrigger value="invitations" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Convites ({invitations.filter((i) => i.status !== "expired").length})
             </TabsTrigger>
           </TabsList>

          <TabsContent value="referrals" className="space-y-4 mt-4">
            {referrals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma referência ainda</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Compartilhe seu código ou link para começar a ganhar comissões
                  </p>
                </CardContent>
              </Card>
            ) : (
              referrals.map((referral) => (
                <Card key={referral.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {referral.full_name || "Usuário"}
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {referral.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {referral.referral_type === "link" ? "Link" : "Código"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(referral.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="event-commissions" className="space-y-4 mt-4">
            {eventCommissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma comissão por evento configurada</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Os organizadores podem criar comissões específicas por evento para você
                  </p>
                </CardContent>
              </Card>
            ) : (
              eventCommissions.map((commission) => {
                const stats = commission.stats || { paid_registrations: 0, invitations_earned: 0, total_commission_earned: 0 };
                const paidCount = stats.paid_registrations;
                const invitationsEarned = stats.invitations_earned;
                const totalCommissionEarned = stats.total_commission_earned || 0;
                const requiredPurchases = commission.required_purchases || 0;
                
                // Calculate progress for next invitation
                let nextInvitationProgress = 0;
                let remainingForNext = 0;
                
                if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
                  if (requiredPurchases > 0) {
                    // Calculate how many invitations should have been earned
                    const expectedInvitations = Math.floor(paidCount / requiredPurchases);
                    // Calculate progress towards next invitation
                    const currentCycle = paidCount % requiredPurchases;
                    nextInvitationProgress = (currentCycle / requiredPurchases) * 100;
                    remainingForNext = requiredPurchases - currentCycle;
                  }
                }
                
                return (
                <Card key={commission.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {commission.event_title || "Evento"}
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {commission.event_date
                            ? formatDateOnlyBrasilia(commission.event_date)
                            : "Data não informada"}
                        </div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {commission.bonus_type === 'commission' && (
                            <Badge variant="default" className="text-xs">
                              💰 Comissão: {commission.commission_percentage}%
                            </Badge>
                          )}
                          {commission.bonus_type === 'invitation' && (
                            <Badge variant="secondary" className="text-xs">
                              🎁 Convite: {requiredPurchases} compras
                            </Badge>
                          )}
                          {commission.bonus_type === 'both' && (
                            <>
                              <Badge variant="default" className="text-xs">
                                💰 Comissão: {commission.commission_percentage}%
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                🎁 Convite: {requiredPurchases} compras
                              </Badge>
                            </>
                          )}
                        </div>
                        
                        {/* Display total commission earned for commission/both types */}
                        {(commission.bonus_type === 'commission' || commission.bonus_type === 'both') && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-md">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">
                                Total de Comissão Ganha:
                              </span>
                              <span className="text-lg font-bold text-green-600">
                                R$ {totalCommissionEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Progress bar for invitations */}
                        {(commission.bonus_type === 'invitation' || commission.bonus_type === 'both') && requiredPurchases > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                Convites ganhos: <strong className="text-foreground">{invitationsEarned}</strong>
                              </span>
                              <span className="text-muted-foreground">
                                Compras pagas: <strong className="text-foreground">{paidCount}</strong>
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Progresso para próximo convite</span>
                                <span>{remainingForNext > 0 ? `${remainingForNext} compras restantes` : 'Pronto para ganhar!'}</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                                <div
                                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(nextInvitationProgress, 100)}%` }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {paidCount} / {requiredPurchases} compras neste ciclo
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {commission.coupon?.link ? (
                      <div className="pt-4 border-t">
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Link de Referência com Cupom
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-muted px-4 py-2 rounded-lg text-xs font-mono break-all">
                            {commission.coupon.link}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(commission.coupon!.link);
                              toast.success("Link copiado!");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const link = commission.coupon!.link;
                              // Clean link if it has multiple URLs (shouldn't happen, but just in case)
                              const cleanLink = link.includes(',') ? link.split(',')[0].trim() : link;
                              window.open(cleanLink, '_blank', 'noopener,noreferrer');
                            }}
                            title="Abrir link em nova aba"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Cupom: <strong>{commission.coupon.code}</strong> - Compartilhe este link para que as pessoas se inscrevam com desconto automático
                        </p>
                      </div>
                    ) : (
                      <div className="pt-4 border-t">
                        <p className="text-xs text-muted-foreground">
                          Link de referência ainda não disponível
                        </p>
                      </div>
                    )}
                    
                    {/* Button to register athlete */}
                    <div className="pt-4 border-t mt-4">
                      <Button
                        onClick={() => handleOpenRegisterDialog(commission.event_id, commission.id)}
                        className="w-full"
                        variant="default"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Inscrever Atleta
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4 mt-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Buscar Evento
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Digite o nome do evento..."
                        value={eventSearch}
                        onChange={(e) => setEventSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Filtrar por Evento
                    </label>
                    <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os eventos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os eventos</SelectItem>
                        {filteredEvents.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Status de Pagamento
                    </label>
                    <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Finalizado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Registrations List */}
            {loadingRegistrations ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : couponRegistrations.filter((r) => r.status !== "cancelled").length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma compra encontrada</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedEventId !== "all" || paymentStatusFilter !== "all"
                      ? "Tente ajustar os filtros"
                      : "As compras realizadas via seus links aparecerão aqui"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {couponRegistrations
                  .filter((registration) => registration.status !== "cancelled")
                  .map((registration) => (
                  <Card key={registration.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="font-semibold mb-1">
                            {registration.runner_name || "Usuário"}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {registration.runner_email}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            CPF: {registration.runner_cpf || "N/A"}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {registration.event_title}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {registration.category_name}
                            </Badge>
                            <Badge
                              variant={
                                registration.payment_status === "paid" || registration.payment_status === "convidado"
                                  ? "default"
                                  : registration.payment_status === "pending"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {registration.payment_status === "paid"
                                ? "Finalizado"
                                : registration.payment_status === "convidado"
                                ? "Convite"
                                : registration.payment_status === "pending"
                                ? "Pendente"
                                : "Cancelado"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">
                            {formatCurrency(registration.total_amount)}
                          </div>
                          {registration.coupon_code ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              Cupom: {registration.coupon_code}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-1">
                              Via referência
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(registration.created_at)}
                        </div>
                        {registration.confirmation_code && (
                          <div className="text-xs text-muted-foreground">
                            Código: {registration.confirmation_code}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="commissions" className="space-y-4 mt-4">
            {commissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma comissão ainda</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comissões aparecerão aqui quando seus referenciados se inscreverem
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Busca de Eventos */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por evento..."
                    value={commissionEventSearchTerm}
                    onChange={(e) => setCommissionEventSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Lista de Eventos */}
                {filteredCommissionEvents.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">Nenhum evento encontrado</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredCommissionEvents.map((event) => {
                      const filteredCommissions = getFilteredCommissionsForEvent(event.event_id);
                      return (
                        <AccordionItem key={event.event_id} value={event.event_id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex-1 text-left">
                                <div className="font-semibold">{event.event_title}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {event.totalCommissions} comissão(ões) • Total: {formatCurrency(event.totalAmount)}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-right">
                                  <div className="text-yellow-600 font-semibold">
                                    {formatCurrency(event.pendingAmount)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.pendingCount} pendente(s)
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-green-600 font-semibold">
                                    {formatCurrency(event.paidAmount)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.paidCount} paga(s)
                                  </div>
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pt-4">
                              {/* Busca de Usuários dentro do evento */}
                              <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Buscar por usuário..."
                                  value={commissionUserSearchTerm[event.event_id] || ""}
                                  onChange={(e) => {
                                    setCommissionUserSearchTerm((prev) => ({
                                      ...prev,
                                      [event.event_id]: e.target.value,
                                    }));
                                  }}
                                  className="pl-10"
                                />
                              </div>

                              {/* Tabela de Comissões do Evento */}
                              {filteredCommissions.length === 0 ? (
                                <Card>
                                  <CardContent className="py-8 text-center">
                                    <p className="text-muted-foreground">Nenhuma comissão encontrada</p>
                                  </CardContent>
                                </Card>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Usuário Referenciado</TableHead>
                                      <TableHead>Valor Inscrição</TableHead>
                                      <TableHead>Comissão</TableHead>
                                      <TableHead>Percentual</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Data</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredCommissions.map((commission) => (
                                      <TableRow key={commission.id}>
                                        <TableCell>
                                          <div>
                                            <div className="font-medium">
                                              {commission.referred_user_name || "N/A"}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                              {commission.referred_user_email}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>{formatCurrency(commission.registration_amount)}</TableCell>
                                        <TableCell className="font-semibold text-primary">
                                          {formatCurrency(commission.commission_amount)}
                                        </TableCell>
                                        <TableCell>{commission.commission_percentage}%</TableCell>
                                        <TableCell>
                                          <Badge
                                            variant={
                                              commission.status === "paid"
                                                ? "default"
                                                : commission.status === "pending"
                                                ? "secondary"
                                                : "destructive"
                                            }
                                          >
                                            {commission.status === "paid"
                                              ? "Pago"
                                              : commission.status === "pending"
                                              ? "Pendente"
                                              : "Cancelado"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>{formatDate(commission.created_at)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invitations" className="space-y-4 mt-4">
            {loadingInvitations ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invitations.filter((i) => i.status !== "expired").length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Gift className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum convite disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Você receberá convites quando atingir as metas de compras configuradas pelos organizadores
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Available Invitations */}
                {invitations.filter(i => i.status === 'available').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Disponíveis ({invitations.filter(i => i.status === 'available').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'available')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.event_date && (
                                    <div className="text-sm text-muted-foreground mb-2">
                                      {formatDateOnlyBrasilia(invitation.event_date)}
                                    </div>
                                  )}
                                  <Badge variant="default" className="text-xs">
                                    Disponível
                                  </Badge>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenSendDialog(invitation)}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Enviar
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* Sent Invitations */}
                {invitations.filter(i => i.status === 'sent').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Enviados ({invitations.filter(i => i.status === 'sent').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'sent')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.runner_name && (
                                    <div className="text-sm mb-1">
                                      Para: <span className="font-medium">{invitation.runner_name}</span>
                                    </div>
                                  )}
                                  {invitation.runner_cpf && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                      CPF: {invitation.runner_cpf}
                                    </div>
                                  )}
                                  {invitation.sent_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Enviado em: {formatDate(invitation.sent_at)}
                                    </div>
                                  )}
                                  <Badge variant="secondary" className="text-xs mt-2">
                                    Enviado
                                  </Badge>
                                  {!hasValidRunnerEmail(invitation) && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                      Corredor sem email válido. Baixe o comprovante e envie por outro meio (ex.: WhatsApp).
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2 shrink-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openInvitationTicketModal(invitation.id)}
                                  >
                                    <QrCode className="h-4 w-4 mr-1" />
                                    Ver ingresso
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadInvitationReceiptById(invitation.id)}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                    Baixar PDF
                                  </Button>
                                  {hasValidRunnerEmail(invitation) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={resendingInvitationId === invitation.id}
                                      onClick={() => handleResendInvitationEmail(invitation.id)}
                                    >
                                      {resendingInvitationId === invitation.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <>
                                          <Send className="h-4 w-4 mr-1" />
                                          Reenviar email
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* Used Invitations */}
                {invitations.filter(i => i.status === 'used').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Utilizados ({invitations.filter(i => i.status === 'used').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'used')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.runner_name && (
                                    <div className="text-sm mb-1">
                                      Para: <span className="font-medium">{invitation.runner_name}</span>
                                    </div>
                                  )}
                                  {invitation.used_at && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                      Utilizado em: {formatDate(invitation.used_at)}
                                    </div>
                                  )}
                                  <Badge variant="outline" className="text-xs mt-2">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Utilizado
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* Se tem convites (não expirados) mas nenhum disponível para enviar, mostrar mensagem */}
                {invitations.filter((i) => i.status !== "expired").length > 0 && invitations.filter(i => i.status === 'available').length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No momento você não tem convites disponíveis para enviar. Novos convites são gerados quando as metas de inscrições pagas com seu cupom forem atingidas.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Invitation Ticket (Ver ingresso) Modal */}
      <Dialog
        open={!!invitationTicketInvitationId}
        onOpenChange={(open) => {
          if (!open) closeInvitationTicketModal();
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ingresso do convite</DialogTitle>
            <DialogDescription>Inscrição vinculada a este convite. Você pode baixar o comprovante e enviar ao corredor.</DialogDescription>
          </DialogHeader>
          {loadingInvitationTicket && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!loadingInvitationTicket && invitationTicketRegistration && (() => {
            const reg = invitationTicketRegistration;
            const isConfirmed =
              reg.status === "confirmed" &&
              (reg.payment_status === "paid" || (reg as any).payment_status === "convidado");
            const validationUrl = `${window.location.origin}/registration/validate/${reg.id}`;
            const locationText =
              (reg as any).location ||
              `${(reg as any).city || ""}, ${(reg as any).state || ""}`.trim() ||
              "Local não informado";
            return (
              <div className="space-y-4">
                {isConfirmed ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-center text-base">QR Code da Inscrição</CardTitle>
                      <p className="text-xs text-muted-foreground text-center">
                        Apresente este código no dia do evento
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-2">
                      <div className="bg-white p-3 rounded-lg">
                        <QRCodeSVG value={validationUrl} size={200} level="H" includeMargin />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Código: {reg.confirmation_code || reg.id.substring(0, 8).toUpperCase()}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-yellow-500 bg-yellow-50">
                    <CardContent className="pt-4 pb-4">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
                        <p className="text-sm text-yellow-700">Inscrição pendente de confirmação</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{reg.event_title || "Evento"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {reg.event_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDateTimeBrasilia(reg.event_date)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{locationText}</span>
                    </div>
                    <div className="pt-2 border-t flex justify-between">
                      <span className="text-muted-foreground">Categoria:</span>
                      <span>{reg.category_name || "N/A"}</span>
                    </div>
                    {reg.kit_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Kit:</span>
                        <span>{reg.kit_name}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Dados do Corredor
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span>{reg.runner_name || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPF:</span>
                      <span>{reg.runner_cpf ? maskCpf(reg.runner_cpf) : "N/A"}</span>
                    </div>
                  </CardContent>
                </Card>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleDownloadInvitationReceipt(invitationTicketRegistration)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar comprovante
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Send Invitation Dialog */}
      <Dialog
        open={sendInvitationDialogOpen}
          onOpenChange={(open) => {
          if (!open) {
            setInviteStep(1);
            setInviteAthleteFound(null);
            setInviteAthleteData(null);
            setInviteRunnerFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
            setInviteRunnerFormErrors({});
            setInviteCpfError("");
            setInviteApiError("");
            setInviteRunnerChoosesCategoryModalityKit(true);
            setInviteCategoryId("");
            setInviteModalityId("");
            setInviteKitId("");
            setInviteVariantSelections({});
          }
          setSendInvitationDialogOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Enviar Convite</DialogTitle>
            <DialogDescription>
              Busque o runner pelo CPF. Se não estiver cadastrado, preencha os dados para pré-cadastro e envio do convite.
            </DialogDescription>
          </DialogHeader>
          {selectedInvitation && (
            <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
              <div>
                <Label>Evento</Label>
                <div className="text-sm font-medium mt-1">{selectedInvitation.event_title || "Evento"}</div>
              </div>

              <div className="flex items-center space-x-2 rounded-md border p-3 bg-muted/30">
                <Checkbox
                  id="invite-runner-chooses"
                  checked={inviteRunnerChoosesCategoryModalityKit}
                  onCheckedChange={(checked) => {
                    setInviteRunnerChoosesCategoryModalityKit(checked !== false);
                    if (checked === true) {
                      setInviteCategoryId("");
                      setInviteModalityId("");
                      setInviteKitId("");
                      setInviteVariantSelections({});
                    }
                  }}
                />
                <Label htmlFor="invite-runner-chooses" className="text-sm font-normal cursor-pointer leading-tight">
                  Deixar o corredor escolher categoria, modalidade e kit
                </Label>
              </div>

              {!inviteRunnerChoosesCategoryModalityKit && (
                <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                  <p className="text-sm font-medium text-muted-foreground">Definir no convite</p>
                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select
                      value={inviteCategoryId || undefined}
                      onValueChange={(v) => {
                        setInviteCategoryId(v || "");
                        setInviteModalityId("");
                        setInviteKitId("");
                        setInviteVariantSelections({});
                      }}
                      disabled={loadingInviteOptions}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingInviteOptions ? "Carregando..." : "Selecione a categoria"} />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} - R$ {c.price.toFixed(2).replace(".", ",")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Modalidade</Label>
                    <Select
                      value={inviteModalityId || undefined}
                      onValueChange={(v) => setInviteModalityId(v || "")}
                      disabled={loadingInviteOptions}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a modalidade (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {(inviteCategoryId
                          ? inviteModalities.filter((m) => inviteCategories.find((c) => c.id === inviteCategoryId)?.modality_ids?.includes(m.id))
                          : inviteModalities
                        ).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} {m.distance ? `- ${m.distance}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Kit</Label>
                    <Select
                      value={inviteKitId || undefined}
                      onValueChange={(v) => {
                        setInviteKitId(v || "");
                        setInviteVariantSelections({});
                      }}
                      disabled={loadingInviteOptions}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o kit (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteKits.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.name} - R$ {k.price.toFixed(2).replace(".", ",")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteKitId && (() => {
                    const kit = inviteKits.find((k) => k.id === inviteKitId);
                    const variableProducts = (kit?.products || []).filter((p) => p.type === "variable" && (p.variants?.length ?? 0) > 0);
                    return variableProducts.length > 0 ? (
                      <div className="space-y-2 pt-2 border-t">
                        <Label>Tamanho / variante</Label>
                        {variableProducts.map((product) => (
                          <div key={product.id} className="space-y-1">
                            <span className="text-sm text-muted-foreground">{product.name}</span>
                            <Select
                              value={inviteVariantSelections[product.id] || ""}
                              onValueChange={(v) => setInviteVariantSelections((prev) => ({ ...prev, [product.id]: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {(product.variants || []).map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.name}
                                    {v.available_quantity != null && v.available_quantity <= 0 ? " (Esgotada)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {inviteStep === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="runner_cpf">CPF do runner *</Label>
                  <div className="flex gap-2 min-w-0">
                    <Input
                      id="runner_cpf"
                      placeholder="000.000.000-00"
                      value={runnerCpf}
                      onChange={(e) => {
                        setRunnerCpf(maskCpf(e.target.value));
                        setInviteCpfError("");
                      }}
                      className="flex-1 min-w-0"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      onClick={handleInviteCpfLookup}
                      disabled={inviteCpfLookupLoading || unmask(runnerCpf).length !== 11}
                    >
                      {inviteCpfLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-1">{inviteCpfLookupLoading ? "Buscando..." : "Buscar"}</span>
                    </Button>
                  </div>
                  {inviteCpfError && <p className="text-sm text-destructive">{inviteCpfError}</p>}
                </div>
              )}

              {inviteStep === 2 && inviteAthleteFound === true && inviteAthleteData && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                  <p className="font-medium">Atleta encontrado</p>
                  <p>{inviteAthleteData.full_name || "—"}</p>
                  {inviteAthleteData.email && <p className="text-muted-foreground">{inviteAthleteData.email}</p>}
                  {inviteAthleteData.city && <p className="text-muted-foreground">{inviteAthleteData.city}</p>}
                </div>
              )}

              {inviteStep === 2 && inviteAthleteFound === false && (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    CPF não cadastrado. Preencha os dados para pré-cadastro e envio do convite.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="invite-full_name">Nome completo *</Label>
                    <Input
                      id="invite-full_name"
                      placeholder="Nome do atleta"
                      value={inviteRunnerFormData.full_name}
                      onChange={(e) => {
                        setInviteRunnerFormData((p) => ({ ...p, full_name: e.target.value }));
                        if (inviteRunnerFormErrors.full_name) setInviteRunnerFormErrors((p) => ({ ...p, full_name: "" }));
                      }}
                    />
                    {inviteRunnerFormErrors.full_name && <p className="text-sm text-destructive">{inviteRunnerFormErrors.full_name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-birth_date">Data de nascimento *</Label>
                    <Input
                      id="invite-birth_date"
                      type="date"
                      value={inviteRunnerFormData.birth_date}
                      onChange={(e) => {
                        setInviteRunnerFormData((p) => ({ ...p, birth_date: e.target.value }));
                        if (inviteRunnerFormErrors.birth_date) setInviteRunnerFormErrors((p) => ({ ...p, birth_date: "" }));
                      }}
                    />
                    {inviteRunnerFormErrors.birth_date && <p className="text-sm text-destructive">{inviteRunnerFormErrors.birth_date}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-city">Cidade *</Label>
                    <Input
                      id="invite-city"
                      placeholder="Cidade"
                      value={inviteRunnerFormData.city}
                      onChange={(e) => {
                        setInviteRunnerFormData((p) => ({ ...p, city: e.target.value }));
                        if (inviteRunnerFormErrors.city) setInviteRunnerFormErrors((p) => ({ ...p, city: "" }));
                      }}
                    />
                    {inviteRunnerFormErrors.city && <p className="text-sm text-destructive">{inviteRunnerFormErrors.city}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Sexo *</Label>
                    <RadioGroup
                      value={inviteRunnerFormData.gender}
                      onValueChange={(v) => {
                        setInviteRunnerFormData((p) => ({ ...p, gender: v }));
                        if (inviteRunnerFormErrors.gender) setInviteRunnerFormErrors((p) => ({ ...p, gender: "" }));
                      }}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="M" id="invite-gender-m" />
                        <Label htmlFor="invite-gender-m" className="font-normal cursor-pointer">Masculino</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="F" id="invite-gender-f" />
                        <Label htmlFor="invite-gender-f" className="font-normal cursor-pointer">Feminino</Label>
                      </div>
                    </RadioGroup>
                    {inviteRunnerFormErrors.gender && <p className="text-sm text-destructive">{inviteRunnerFormErrors.gender}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-team">Equipe (opcional)</Label>
                    <Input
                      id="invite-team"
                      placeholder="Nome da equipe"
                      value={inviteRunnerFormData.team}
                      onChange={(e) => setInviteRunnerFormData((p) => ({ ...p, team: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email (opcional)</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="email@exemplo.com"
                        value={inviteRunnerFormData.email}
                        onChange={(e) => setInviteRunnerFormData((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-phone">Telefone (opcional)</Label>
                      <Input
                        id="invite-phone"
                        placeholder="(00) 00000-0000"
                        value={inviteRunnerFormData.phone}
                        onChange={(e) => setInviteRunnerFormData((p) => ({ ...p, phone: maskPhone(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {inviteApiError && <p className="text-sm text-destructive">{inviteApiError}</p>}
            </div>
          )}
          <DialogFooter className="shrink-0">
            {inviteStep === 2 && (
              <Button variant="outline" onClick={() => setInviteStep(1)} disabled={sendingInvitation}>
                Voltar
              </Button>
            )}
            <Button variant="outline" onClick={() => setSendInvitationDialogOpen(false)} disabled={sendingInvitation}>
              Cancelar
            </Button>
            <Button
              onClick={inviteStep === 1 ? handleInviteCpfLookup : handleSendInvitation}
              disabled={
                sendingInvitation ||
                (inviteStep === 1 && (inviteCpfLookupLoading || unmask(runnerCpf).length !== 11)) ||
                (inviteStep === 2 && inviteAthleteFound === false && !inviteRunnerFormData.full_name?.trim()) ||
                (inviteStep === 2 && !inviteRunnerChoosesCategoryModalityKit && !inviteCategoryId?.trim())
              }
            >
              {sendingInvitation ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : inviteStep === 1 ? (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Athlete Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inscrever Atleta</DialogTitle>
            <DialogDescription>
              Inscreva um atleta no evento informando apenas o email. A comissão será gerada automaticamente quando o pagamento for confirmado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email do Atleta *</Label>
              <Input
                id="email"
                type="email"
                placeholder="atleta@email.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
              />
            </div>

            {/* Event is already selected, show it */}
            {selectedEventForRegistration && (
              <div className="space-y-2">
                <Label htmlFor="event">Evento</Label>
                <Input
                  id="event"
                  value={eventCommissions.find(c => c.event_id === selectedEventForRegistration)?.event_title || "Evento"}
                  disabled
                />
              </div>
            )}

            {/* Modality (optional) */}
            {selectedEventForRegistration && (
              <div className="space-y-2">
                <Label htmlFor="modality">Modalidade</Label>
                <Select 
                  value={selectedModalityId || undefined} 
                  onValueChange={(value) => setSelectedModalityId(value || "")}
                  disabled={loadingModalities}
                >
                  <SelectTrigger id="modality">
                    <SelectValue placeholder={loadingModalities ? "Carregando..." : "Selecione a modalidade (opcional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {modalities.map((modality) => (
                      <SelectItem key={modality.id} value={modality.id}>
                        {modality.name} {modality.distance && `- ${modality.distance}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModalityId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedModalityId("")}
                  >
                    Limpar seleção
                  </Button>
                )}
              </div>
            )}

            {/* Category */}
            {selectedEventForRegistration && (
              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select 
                  value={selectedCategoryId} 
                  onValueChange={setSelectedCategoryId}
                  disabled={loadingCategories}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={loadingCategories ? "Carregando..." : "Selecione a categoria"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name} - R$ {category.price.toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Kit (optional) */}
            {selectedEventForRegistration && (
              <div className="space-y-2">
                <Label htmlFor="kit">Kit</Label>
                <Select 
                  value={selectedKitId || undefined} 
                  onValueChange={(value) => setSelectedKitId(value || "")}
                  disabled={loadingKits}
                >
                  <SelectTrigger id="kit">
                    <SelectValue placeholder={loadingKits ? "Carregando..." : "Selecione o kit (opcional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {kits.map((kit) => (
                      <SelectItem key={kit.id} value={kit.id}>
                        {kit.name} - R$ {kit.price.toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedKitId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedKitId("")}
                  >
                    Remover kit
                  </Button>
                )}
              </div>
            )}

            {/* Coupon info */}
            {selectedEventForRegistration && (() => {
              // Buscar comissão específica se commission_id foi fornecido, senão usar a primeira encontrada
              const eventCommission = selectedCommissionId
                ? eventCommissions.find(c => c.id === selectedCommissionId && c.event_id === selectedEventForRegistration)
                : eventCommissions.find(c => c.event_id === selectedEventForRegistration);
              const coupon = eventCommission?.coupon;
              
              if (coupon) {
                return (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          Cupom que será aplicado:
                        </div>
                        <div className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300">
                          {coupon.code}
                        </div>
                        {coupon.discount_value !== undefined && (
                          <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                            Desconto: {coupon.type === 'fixed' ? `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')}` : `${coupon.discount_value}%`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Total amount preview */}
            {selectedCategoryId && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-lg font-bold">
                    R$ {(
                      (categories.find(c => c.id === selectedCategoryId)?.price || 0) +
                      (selectedKitId ? (kits.find(k => k.id === selectedKitId)?.price || 0) : 0)
                    ).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                {(() => {
                  // Buscar comissão específica se commission_id foi fornecido
                  const eventCommission = selectedCommissionId
                    ? eventCommissions.find(c => c.id === selectedCommissionId && c.event_id === selectedEventForRegistration)
                    : eventCommissions.find(c => c.event_id === selectedEventForRegistration);
                  const coupon = eventCommission?.coupon;
                  if (coupon && coupon.discount_value !== undefined) {
                    const baseAmount = (categories.find(c => c.id === selectedCategoryId)?.price || 0) +
                      (selectedKitId ? (kits.find(k => k.id === selectedKitId)?.price || 0) : 0);
                    
                    // Calculate discount based on coupon type
                    const discountAmount = coupon.type === 'fixed' 
                      ? coupon.discount_value 
                      : baseAmount * (coupon.discount_value / 100);
                    const finalAmount = Math.max(0, baseAmount - discountAmount);
                    
                    return (
                      <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Subtotal:</span>
                          <span>R$ {baseAmount.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                          <span>Desconto {coupon.type === 'fixed' ? `(R$ ${coupon.discount_value.toFixed(2).replace('.', ',')})` : `(${coupon.discount_value}%)`}:</span>
                          <span>- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-muted-foreground/20">
                          <span className="font-semibold">Total com desconto:</span>
                          <span className="text-lg font-bold text-green-600 dark:text-green-400">
                            R$ {finalAmount.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseRegisterDialog} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterAthlete} disabled={isSubmitting || !registerEmail || !selectedEventForRegistration || !selectedCategoryId}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscrevendo...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Inscrever Atleta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

