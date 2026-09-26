import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PageGate from "@/components/PageGate";
import AppLayout from "@/components/AppLayout";
import SalesRepsAcctivatePage from "@/pages/SalesRepsAcctivatePage";
import HighPointAppointmentsPage from "@/pages/HighPointAppointmentsPage";

import DealersPage from "@/pages/DealersPage";
import DirectoryPage from "@/pages/DirectoryPage";
import KpiPage from "@/pages/KpiPage";
import ManagersPage from "@/pages/ManagersPage";
import RepActivityPage from "@/pages/RepActivityPage";
import SettingsPage from "@/pages/SettingsPage";
import DownloadAppPage from "@/pages/DownloadAppPage";
import BookingsReportPage from "@/pages/BookingsReportPage";
import InvoicingReportPage from "@/pages/InvoicingReportPage";
import CompanyWidePage from "@/pages/CompanyWidePage";
import MondayBoardsPage from "@/pages/MondayBoardsPage";
import TasksPage from "@/pages/TasksPage";
import SalesTargetsPage from "@/pages/SalesTargetsPage";
import InventoryPage from "@/pages/InventoryPage";
import CatalogPage from "@/pages/CatalogPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CartPage from "@/pages/CartPage";
import MyQuotesPage from "@/pages/MyQuotesPage";
import CustomerQuotesPage from "@/pages/CustomerQuotesPage";
import CustomerQuoteBuilderPage from "@/pages/CustomerQuoteBuilderPage";
import CustomerQuoteViewPage from "@/pages/CustomerQuoteViewPage";
import DigitalAssetsPage from "@/pages/DigitalAssetsPage";

import CheckInsPage from "@/pages/CheckInsPage";
import CheckInAnalyticsPage from "@/pages/CheckInAnalyticsPage";
import TravelLogPage from "@/pages/TravelLogPage";
import TradeShowLeadsPage from "@/pages/TradeShowLeadsPage";
import CaptureLeadsPage from "@/pages/CaptureLeadsPage";
import OrgChartPage from "@/pages/OrgChartPage";
import AuthPage from "@/pages/AuthPage";
import UnsubscribePage from "@/pages/UnsubscribePage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import NotFound from "@/pages/NotFound";
import CrmAccountsPage from "@/pages/crm/CrmAccountsPage";
import CrmAccountsAnalyticsPage from "@/pages/crm/CrmAccountsAnalyticsPage";
import CrmAccountDetailPage from "@/pages/crm/CrmAccountDetailPage";
import CrmNewAccountPage from "@/pages/crm/CrmNewAccountPage";
import ProspectReportingPage from "@/pages/crm/ProspectReportingPage";
import ClearanceProductsPage from "@/pages/ClearanceProductsPage";
import ClearanceAnalyticsPage from "@/pages/ClearanceAnalyticsPage";
import LaborDayPromoPage from "@/pages/LaborDayPromoPage";
import PreSalePage from "@/pages/PreSalePage";
import PortalAccessPage from "@/pages/PortalAccessPage";
import MeetingIntelligencePage from "@/pages/MeetingIntelligencePage";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <SonnerToaster richColors position="bottom-right" />
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/q/:token" element={<CustomerQuoteViewPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<PageGate page="home"><CompanyWidePage /></PageGate>} />
                      <Route path="/managers" element={<PageGate page="sales-managers"><ManagersPage /></PageGate>} />
                      <Route path="/reps-acctivate" element={<PageGate page="reps-acctivate"><SalesRepsAcctivatePage /></PageGate>} />
                      <Route path="/rep-activity" element={<PageGate page="rep-login-activity"><RepActivityPage /></PageGate>} />
                      <Route path="/desktop-app" element={<PageGate page="desktop-app"><DownloadAppPage /></PageGate>} />
                      <Route path="/dealers" element={<PageGate page="dealers"><DealersPage /></PageGate>} />
                      <Route path="/directory" element={<PageGate page="directory"><DirectoryPage /></PageGate>} />
                      <Route path="/kpi" element={<PageGate page="kpi"><CompanyWidePage /></PageGate>} />
                      <Route path="/company-wide" element={<PageGate page="company-wide"><CompanyWidePage /></PageGate>} />
                      <Route path="/reports/bookings" element={<PageGate page="reports-bookings"><CompanyWidePage /></PageGate>} />
                      <Route path="/reports/invoicing" element={<PageGate page="reports-invoicing"><CompanyWidePage /></PageGate>} />
                      <Route path="/monday-boards" element={<PageGate page="monday-boards"><MondayBoardsPage /></PageGate>} />
                      <Route path="/tasks" element={<PageGate page="my-tasks"><TasksPage /></PageGate>} />
                      <Route path="/sales-targets" element={<PageGate page="sales-targets"><SalesTargetsPage /></PageGate>} />
                      <Route path="/inventory" element={<PageGate page="inventory"><InventoryPage /></PageGate>} />
                      <Route path="/catalog" element={<PageGate page="product-catalog"><CatalogPage /></PageGate>} />
                      <Route path="/catalog/:sku" element={<PageGate page="product-detail"><ProductDetailPage /></PageGate>} />
                      <Route path="/cart" element={<PageGate page="cart"><CartPage /></PageGate>} />
                      <Route path="/my-quotes" element={<PageGate page="my-quotes"><MyQuotesPage /></PageGate>} />
                      <Route path="/customer-quotes" element={<PageGate page="customer-quotes"><CustomerQuotesPage /></PageGate>} />
                      <Route path="/customer-quotes/new" element={<PageGate page="customer-quote-new"><CustomerQuoteBuilderPage /></PageGate>} />
                      <Route path="/customer-quotes/:id" element={<PageGate page="customer-quote-edit"><CustomerQuoteBuilderPage /></PageGate>} />
                      <Route path="/digital-assets" element={<PageGate page="digital-assets"><DigitalAssetsPage /></PageGate>} />
                      <Route path="/check-ins" element={<PageGate page="field-check-ins"><CheckInsPage /></PageGate>} />
                      <Route path="/check-ins/analytics" element={<PageGate page="visit-analytics"><CheckInAnalyticsPage /></PageGate>} />
                      <Route path="/travel-log" element={<PageGate page="travel-log"><TravelLogPage /></PageGate>} />
                      <Route path="/trade-show-leads" element={<PageGate page="trade-show-leads"><TradeShowLeadsPage /></PageGate>} />
                      <Route path="/trade-show-leads/capture" element={<PageGate page="capture-leads"><CaptureLeadsPage /></PageGate>} />
                      <Route path="/trade-show-leads/hp-appointments" element={<PageGate page="hp-appointments"><HighPointAppointmentsPage /></PageGate>} />
                      <Route path="/clearance" element={<PageGate page="discontinued-products"><ClearanceProductsPage /></PageGate>} />
                      <Route path="/clearance/analytics" element={<PageGate page="discontinued-analytics"><ClearanceAnalyticsPage /></PageGate>} />
                      <Route path="/promotions/labor-day-promo" element={<PageGate page="labor-day-promo"><LaborDayPromoPage /></PageGate>} />
                      <Route path="/promotions/pre-sale" element={<PageGate page="pre-sale"><PreSalePage /></PageGate>} />
                      <Route path="/meeting-intelligence" element={<PageGate page="meeting-intelligence"><MeetingIntelligencePage /></PageGate>} />
                      <Route path="/org-chart" element={<PageGate page="org-chart"><OrgChartPage /></PageGate>} />
                      <Route path="/crm/accounts" element={<PageGate page="prospects"><CrmAccountsPage /></PageGate>} />
                      <Route path="/crm/accounts/analytics" element={<PageGate page="prospects-analytics"><CrmAccountsAnalyticsPage /></PageGate>} />
                      <Route path="/prospects/reporting" element={<PageGate page="prospect-reporting"><ProspectReportingPage /></PageGate>} />
                      <Route path="/crm/accounts/new" element={<PageGate page="prospect-new"><CrmNewAccountPage /></PageGate>} />
                      <Route path="/crm/accounts/:id" element={<PageGate page="prospect-detail"><CrmAccountDetailPage /></PageGate>} />

                      <Route path="/portal-access" element={<PageGate page="portal-access"><PortalAccessPage /></PageGate>} />
                      <Route path="/settings" element={<PageGate page="settings"><SettingsPage /></PageGate>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
