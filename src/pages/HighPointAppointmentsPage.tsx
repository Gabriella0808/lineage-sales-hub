import { HighPointAppointmentsModule } from "@/components/HighPointAppointmentsModule";

export default function HighPointAppointmentsPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">High Point Market Appointments</h1>
          <p className="page-subtitle">Build target lists, schedule showroom appointments and track attendance.</p>
        </div>
      </div>
      <HighPointAppointmentsModule />
    </div>
  );
}
