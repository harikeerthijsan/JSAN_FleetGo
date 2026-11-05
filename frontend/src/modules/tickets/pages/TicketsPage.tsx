import {useAuth} from '@/context/AuthContext';
import { Link, Route, Routes } from 'react-router-dom';
import { EmptyState } from '@/components';
import { TicketTabs } from '../components/TicketTabs';
import { TicketDashboardPage } from './TicketDashboardPage';
import { TicketListPage } from './TicketListPage';
import { CreateTicketPage } from './CreateTicketPage';
import { TicketDetailsPage } from './TicketDetailsPage';
import { ApprovalInboxPage } from './ApprovalInboxPage';
import { WorkflowConfigPage } from './WorkflowConfigPage';
import { SlaDashboardPage } from './SlaDashboardPage';
import { TicketReportsPage } from './TicketReportsPage';
import './TicketsPage.css';

/**
 * Ticketing & Approvals module. Mounted at /tickets/* with internal routing to
 * the dashboard, ticket lists, creation, details, approval inbox, workflow
 * configuration, SLA dashboard and reports.
 */
export function TicketsPage() {
  const {user}=useAuth();
  const configure=['SUPER_ADMIN','JSAN_ADMIN'].includes(user?.role.name??'');
  return (
    <div className="fg-tk">
      <TicketTabs />
      <Routes>
        <Route index element={<TicketDashboardPage />} />
        <Route path="list" element={<TicketListPage scope="all" />} />
        <Route path="mine" element={<TicketListPage scope="mine" />} />
        <Route path="new" element={<CreateTicketPage />} />
        <Route path="inbox" element={<ApprovalInboxPage />} />
        <Route path="workflows" element={configure?<WorkflowConfigPage />:<EmptyState title="Workflow configuration requires administrative access"/>} />
        <Route path="sla" element={<SlaDashboardPage />} />
        <Route path="reports" element={<TicketReportsPage />} />
        <Route path=":id" element={<TicketDetailsPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              title="Page not found"
              action={<Link to="/tickets">Back to tickets</Link>}
            />
          }
        />
      </Routes>
    </div>
  );
}
