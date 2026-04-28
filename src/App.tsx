import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import SalesRepsPage from "@/pages/SalesRepsPage";

import DealersPage from "@/pages/DealersPage";
import DirectoryPage from "@/pages/DirectoryPage";
import KpiPage from "@/pages/KpiPage";
import ManagersPage from "@/pages/ManagersPage";
import SettingsPage from "@/pages/SettingsPage";
import BookingsReportPage from "@/pages/BookingsReportPage";
import InvoicingReportPage from "@/pages/InvoicingReportPage";
import CompanyWidePage from "@/pages/CompanyWidePage";
import MondayBoardsPage from "@/pages/MondayBoardsPage";
import TasksPage from "@/pages/TasksPage";
import InventoryPage from "@/pages/InventoryPage";
import CheckInsPage from "@/pages/CheckInsPage";
import CheckInAnalyticsPage from "@/pages/CheckInAnalyticsPage";
import TravelLogPage from "@/pages/TravelLogPage";
import TradeShowLeadsPage from "@/pages/TradeShowLeadsPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/managers" element={<ProtectedRoute allow={["admin"]}><ManagersPage /></ProtectedRoute>} />
                      <Route path="/reps" element={<ProtectedRoute allow={["admin", "manager"]}><SalesRepsPage /></ProtectedRoute>} />
                      <Route path="/dealers" element={<DealersPage />} />
                      <Route path="/directory" element={<ProtectedRoute allow={["admin", "manager"]}><DirectoryPage /></ProtectedRoute>} />
                      <Route path="/kpi" element={<CompanyWidePage />} />
                      <Route path="/company-wide" element={<CompanyWidePage />} />
                      <Route path="/reports/bookings" element={<CompanyWidePage />} />
                      <Route path="/reports/invoicing" element={<CompanyWidePage />} />
                      <Route path="/monday-boards" element={<MondayBoardsPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/inventory" element={<ProtectedRoute allow={["admin"]}><InventoryPage /></ProtectedRoute>} />
                      <Route path="/check-ins" element={<ProtectedRoute allow={["admin", "manager"]}><CheckInsPage /></ProtectedRoute>} />
                      <Route path="/check-ins/analytics" element={<ProtectedRoute allow={["admin", "manager"]}><CheckInAnalyticsPage /></ProtectedRoute>} />
                      <Route path="/travel-log" element={<ProtectedRoute allow={["admin", "manager"]}><TravelLogPage /></ProtectedRoute>} />
                      <Route path="/trade-show-leads" element={<ProtectedRoute allow={["admin", "manager"]}><TradeShowLeadsPage /></ProtectedRoute>} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
