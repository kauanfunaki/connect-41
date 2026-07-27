import type { MeetingProvider } from "@/generated/prisma/enums";
import type { MeetingState } from "@/app/(app)/agenda/actions";

export type MeetingRow = {
  id: string;
  provider: MeetingProvider;
  title: string;
  meetingUrl: string;
  startAt: string; // ISO
  endAt: string; // ISO
  attendees: { id: string; name: string }[];
  // externalId = "ID" manual da empresa (referência do Acessórias) — é como o
  // time identifica a empresa no dia a dia, então aparece junto do nome.
  company: { id: string; name: string; externalId: string | null } | null;
  clientName: string | null;
  createdByUserId: string;
};

export type CalendarDay = { dateKey: string; isToday: boolean };
export type UserOption = { id: string; name: string };
export type CompanyOption = { id: string; name: string };

// Ações e listas que toda visão (dia/semana/mês) precisa repassar adiante pro
// popover de reunião — agrupadas pra não arrastar 5 props soltas por 3 níveis.
export type MeetingActions = {
  editAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction: (meetingId: string) => Promise<void>;
  allUsers: UserOption[];
  companies: CompanyOption[];
  currentUserId: string;
};

export const PROVIDER_LABEL: Record<MeetingProvider, string> = {
  GOOGLE: "Google Meet",
  MICROSOFT: "MS Teams",
};
