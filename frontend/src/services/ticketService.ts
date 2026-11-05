import type { ApiSuccess, PaginatedMeta } from '@/types/api';
import type {
  ApprovalDecision,
  ApprovalWorkflow,
  AppNotification,
  Ticket,
  TicketDashboard,
  TicketDetails,
  TicketPriority,
  TicketStatus,
  TicketType,
  WorkflowStep,
} from '@/types/ticket';
import { apiClient } from './apiClient';

export interface ListTicketsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: TicketType;
  status?: TicketStatus;
  priority?: TicketPriority;
  organizationId?: string;
  assignedToId?: string;
  scope?: 'all' | 'mine' | 'approvals';
  overdue?: 'true' | 'false';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CreateTicketPayload {
  type: TicketType;
  subject: string;
  description?: string;
  priority?: TicketPriority;
  requestingOrgId?: string;
  requiredDate?: string;
  sourceDepotId?: string;
  destinationDepotId?: string;
  requestedTypeId?: string;
  requestedQuantity?: number;
  vehicleId?: string;
  details?: Record<string, unknown>;
}

export const ticketService = {
  async dashboard(): Promise<TicketDashboard> {
    const res = await apiClient.get<ApiSuccess<TicketDashboard>>('/tickets/dashboard');
    return res.data.data;
  },

  async slaReport(): Promise<{ total: number; approvalBreaches: number; resolutionBreaches: number; rows: (Ticket & { approvalBreach: boolean; resolutionBreach: boolean; approvalHours: number | null })[] }> {
    const res = await apiClient.get<ApiSuccess<never>>('/tickets/sla-report');
    return res.data.data;
  },

  async availability(params: { typeId?: string; depotId?: string }): Promise<{ totalAvailable: number; byDepot: { depotId: string; depotName: string; count: number }[] }> {
    const res = await apiClient.get<ApiSuccess<never>>('/tickets/availability', { params });
    return res.data.data;
  },

  async list(params: ListTicketsParams): Promise<{ data: Ticket[]; meta: PaginatedMeta }> {
    const res = await apiClient.get<ApiSuccess<Ticket[]>>('/tickets', { params });
    return { data: res.data.data, meta: res.data.meta as unknown as PaginatedMeta };
  },

  async get(id: string): Promise<TicketDetails> {
    const res = await apiClient.get<ApiSuccess<TicketDetails>>(`/tickets/${id}`);
    return res.data.data;
  },

  async create(payload: CreateTicketPayload): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>('/tickets', payload);
    return res.data.data;
  },

  async update(id: string, payload: Partial<CreateTicketPayload>): Promise<Ticket> {
    const res = await apiClient.put<ApiSuccess<Ticket>>(`/tickets/${id}`, payload);
    return res.data.data;
  },

  async submit(id: string): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>(`/tickets/${id}/submit`);
    return res.data.data;
  },

  async decide(id: string, decision: ApprovalDecision, comment?: string): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>(`/tickets/${id}/decision`, { decision, comment });
    return res.data.data;
  },

  async reassignApprover(id: string, approverId: string, note?: string): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>(`/tickets/${id}/reassign-approver`, { approverId, note });
    return res.data.data;
  },

  async escalate(id: string): Promise<{ escalated: boolean; overdue: boolean }> {
    const res = await apiClient.post<ApiSuccess<never>>(`/tickets/${id}/escalate`);
    return res.data.data;
  },

  async assign(id: string, payload: { assignedToId?: string; assignedTeam?: string; note?: string }): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>(`/tickets/${id}/assign`, payload);
    return res.data.data;
  },

  async comment(id: string, body: string, isInternal: boolean): Promise<void> {
    await apiClient.post(`/tickets/${id}/comments`, { body, isInternal });
  },

  async changeStatus(id: string, status: TicketStatus, reason?: string): Promise<Ticket> {
    const res = await apiClient.post<ApiSuccess<Ticket>>(`/tickets/${id}/status`, { status, reason });
    return res.data.data;
  },

  async uploadAttachment(id: string, form: FormData): Promise<void> {
    await apiClient.post(`/tickets/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async downloadAttachment(id: string, attachmentId: string): Promise<Blob> {
    const res = await apiClient.get(`/tickets/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' });
    return res.data as Blob;
  },

  // --- Approvals / workflow config -----------------------------------------
  async inbox(): Promise<Ticket[]> {
    const res = await apiClient.get<ApiSuccess<Ticket[]>>('/approvals/inbox');
    return res.data.data;
  },

  async listWorkflows(): Promise<ApprovalWorkflow[]> {
    const res = await apiClient.get<ApiSuccess<ApprovalWorkflow[]>>('/approvals/workflows');
    return res.data.data;
  },

  async createWorkflow(payload: {
    name: string; description?: string; ticketType?: TicketType | null;
    organizationType?: string | null; allowSelfApproval?: boolean; isActive?: boolean;
    isDefault?: boolean; steps: WorkflowStep[];
  }): Promise<ApprovalWorkflow> {
    const res = await apiClient.post<ApiSuccess<ApprovalWorkflow>>('/approvals/workflows', payload);
    return res.data.data;
  },

  async updateWorkflow(id: string, payload: Record<string, unknown>): Promise<ApprovalWorkflow> {
    const res = await apiClient.put<ApiSuccess<ApprovalWorkflow>>(`/approvals/workflows/${id}`, payload);
    return res.data.data;
  },

  // --- Notifications --------------------------------------------------------
  async notifications(unreadOnly = false): Promise<{ data: AppNotification[]; unread: number }> {
    const res = await apiClient.get<ApiSuccess<AppNotification[]>>('/tickets/notifications', {
      params: unreadOnly ? { unread: 'true' } : {},
    });
    return { data: res.data.data, unread: (res.data.meta as { unread?: number })?.unread ?? 0 };
  },

  async markNotificationRead(id: string): Promise<void> {
    await apiClient.post(`/tickets/notifications/${id}/read`);
  },

  async markAllNotificationsRead(): Promise<void> {
    await apiClient.post('/tickets/notifications/read-all');
  },
};
