import Layout from "./Layout.jsx";

import Login from "./Login";

import SalesPJDashboard from "./SalesPJDashboard";
import SalesPJAgentsDashboard from "./SalesPJAgentsDashboard";
import MyDashboardPJ from "./MyDashboardPJ";
import NewLeadPJ from "./NewLeadPJ";
import LeadsPJKanban from "./LeadsPJKanban";
import LeadPJSearch from "./LeadPJSearch";
import SalesPJReports from "./SalesPJReports";
import SalesPJWonReport from "./SalesPJWonReport";
import SalesPJLostReport from "./SalesPJLostReport";
import LeadPJReportList from "./LeadPJReportList";
import LeadPJAutomations from "./LeadPJAutomations";
import LeadPJDetail from "./LeadPJDetail";
import AutomationLogs from "./AutomationLogs";

import SalesAgenda from "./SalesAgenda";
import AgendasPanel from "./AgendasPanel";
import SalesTasks from "./SalesTasks";
import ProposalTemplates from "./ProposalTemplates";

import Agents from "./Agents";
import Settings from "./Settings";

import PublicSignature from "./PublicSignature";
import PublicProposal from "./PublicProposal";
import PublicContractSign from "./PublicContractSign";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

function HomeRedirect() {
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me(),
        enabled: !!localStorage.getItem('accessToken'),
        staleTime: 30000,
    });

    if (!user) return <SalesPJDashboard />;

    const agent = user.agent;
    const agentType = agent?.agentType || agent?.agent_type;
    const isAdmin = user.role === 'admin' || agentType === 'admin';
    const isSupervisor = agentType?.includes('supervisor');

    if (!isAdmin && !isSupervisor && agent) {
        return <Navigate to="/MyDashboardPJ" replace />;
    }

    return <SalesPJDashboard />;
}

const PAGES = {
    Login: Login,

    SalesPJDashboard: SalesPJDashboard,
    SalesPJAgentsDashboard: SalesPJAgentsDashboard,
    MyDashboardPJ: MyDashboardPJ,
    NewLeadPJ: NewLeadPJ,
    LeadsPJKanban: LeadsPJKanban,
    LeadPJSearch: LeadPJSearch,
    SalesPJReports: SalesPJReports,
    SalesPJWonReport: SalesPJWonReport,
    SalesPJLostReport: SalesPJLostReport,
    LeadPJReportList: LeadPJReportList,
    LeadPJAutomations: LeadPJAutomations,
    LeadPJDetail: LeadPJDetail,
    AutomationLogs: AutomationLogs,

    SalesAgenda: SalesAgenda,
    AgendasPanel: AgendasPanel,
    SalesTasks: SalesTasks,
    ProposalTemplates: ProposalTemplates,

    Agents: Agents,
    Settings: Settings,

    PublicSignature: PublicSignature,
    PublicProposal: PublicProposal,
    PublicContractSign: PublicContractSign,
}

function _getCurrentPage(url) {
    if (url === '/' || url === '') {
        return 'SalesPJDashboard';
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || 'SalesPJDashboard';
}

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/login" element={<Login />} />

                <Route path="/SalesPJDashboard" element={<SalesPJDashboard />} />
                <Route path="/SalesPJAgentsDashboard" element={<SalesPJAgentsDashboard />} />
                <Route path="/MyDashboardPJ" element={<MyDashboardPJ />} />
                <Route path="/NewLeadPJ" element={<NewLeadPJ />} />
                <Route path="/LeadsPJKanban" element={<LeadsPJKanban />} />
                <Route path="/LeadPJSearch" element={<LeadPJSearch />} />
                <Route path="/SalesPJReports" element={<SalesPJReports />} />
                <Route path="/SalesPJWonReport" element={<SalesPJWonReport />} />
                <Route path="/SalesPJLostReport" element={<SalesPJLostReport />} />
                <Route path="/LeadPJReportList" element={<LeadPJReportList />} />
                <Route path="/LeadPJAutomations" element={<LeadPJAutomations />} />
                <Route path="/LeadPJDetail" element={<LeadPJDetail />} />
                <Route path="/AutomationLogs" element={<AutomationLogs />} />

                <Route path="/SalesAgenda" element={<SalesAgenda />} />
                <Route path="/AgendasPanel" element={<AgendasPanel />} />
                <Route path="/SalesTasks" element={<SalesTasks />} />
                <Route path="/ProposalTemplates" element={<ProposalTemplates />} />

                <Route path="/Agents" element={<Agents />} />
                <Route path="/Settings" element={<Settings />} />

                <Route path="/PublicSignature" element={<PublicSignature />} />
                <Route path="/assinatura" element={<PublicSignature />} />
                <Route path="/PublicProposal" element={<PublicProposal />} />
                <Route path="/proposta-publica" element={<PublicProposal />} />
                <Route path="/PublicContractSign" element={<PublicContractSign />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
