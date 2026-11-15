import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/modules/auth";
import {
  listCategories,
} from "@/modules/categories";
import { ApplicationError, AuthenticationError, AuthorizationError } from "@/server/errors";
import { requireConfigurationAdministrator } from "@/server/authorization";
import { listEscalationRuleOverview, listSectors } from "@/modules/sectors";
import { getTeamLoad } from "@/modules/requests";
import { listServices } from "@/modules/services";
import { listUsers } from "@/modules/users";
import { listDocumentRequirements } from "@/modules/document-requirements";
import { listServiceFields } from "@/modules/service-fields";
import { listServiceStages } from "@/modules/service-stages";
import { listAccessRoleOverview, listPermissionOverview } from "@/modules/permissions";
import { RolesSection } from "./_sections/roles/roles-section";
import { listBundleOverview } from "@/modules/service-bundles";
import { BundlesSection } from "./_sections/bundles/bundles-section";
import { getEmailOverview } from "@/modules/notifications";
import { getAnalytics, getDashboard } from "@/modules/reports";
import { listAuditTrail } from "@/modules/audit";
import { CollapsibleNav } from "@/app/_components/collapsible-nav";
import { AuditSection } from "./_sections/audit/audit-section";
import { DashboardView } from "@/app/_components/dashboard-view";
import { AnalyticsView } from "@/app/_components/analytics-view";
import { KnowledgeEditor } from "@/app/_components/knowledge-editor";
import { listArticlesForEditor } from "@/modules/knowledge";
import { CategoriesSection } from "./_sections/categories/categories-section";
import { announcement } from "./_shared/announcement";
import { OverviewSection } from "./_sections/overview-section";
import { SectorsSection } from "./_sections/sectors/sectors-section";
import { ServicesSection } from "./_sections/services/services-section";
import { UsersSection } from "./_sections/users/users-section";
import { EmailsSection } from "./_sections/emails/emails-section";
import { ApiTokensSection } from "./_sections/api-tokens/api-tokens-section";
import { WebhooksSection } from "./_sections/webhooks/webhooks-section";
import { getWebhookOverview } from "@/modules/webhooks";
import { listAllApiTokens } from "@/modules/api-tokens";
import { getCalendarOverview, getSectorCalendarView } from "@/modules/calendar";
import { SectorCalendarPanel } from "@/app/_components/sector-calendar";
import { listAbsences, listAttendantAbsences, listSubstituteCandidates } from "@/modules/absences";
import { AttendantAbsences } from "@/app/_components/attendant-absences";
import { RecurringSchedules } from "@/app/_components/recurring-schedules";
import { loadScheduleScreen } from "@/app/_components/recurring-schedule-screen";
import { checkConfigurationExport } from "@/modules/configuration";
import { ConfigurationSection } from "./_sections/configuration/configuration-section";
import { listSectorTags } from "@/modules/tags";
import { SectorTagsPanel } from "@/app/_components/sector-tags";
import { listAnnouncementsForAdmin } from "@/modules/announcements";
import { AnnouncementsSection } from "./_sections/announcements/announcements-section";
import { listUserImports } from "@/modules/user-import";
import { UserImportSection } from "./_sections/user-import/user-import-section";
import { getPeriodicReport, getPeriodicReportSettings, latestPeriodicReports, listPeriodicReports } from "@/modules/periodic-reports";
import { PeriodicReportsSection } from "./_sections/periodic-reports/periodic-reports-section";
import { LatestPeriodicReports } from "@/app/_components/periodic-reports";
import { AnnouncementStrip } from "@/app/_components/announcement-strip";
import { listServiceChecklists } from "@/modules/checklists";
import { ServiceChecklistsPanel } from "@/app/_components/service-checklists";
import { getTimeReport } from "@/modules/time-entries";
import { TimeReportView } from "@/app/_components/time-report-view";
import { AbsencesSection, type AbsencesOverview } from "./_sections/absences/absences-section";
import { CalendarSection } from "./_sections/calendar/calendar-section";

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    entity?: string;
    notice?: string;
    section?: string;
    period?: string;
    from?: string;
    to?: string;
    sector?: string;
    type?: string;
    actor?: string;
    page?: string;
    knowledge?: string;
    /** SPEC 2026-11-06-aprofundamento-configurabilidade, 4.3.5. */
    absence?: string;
    /** SPEC 2026-11-07-operacao-e-automacao, 5.3 item 4: the schedules' message, chosen service, schedule being changed and field errors. */
    schedule?: string;
    service?: string;
    edit?: string;
    fields?: string;
    /** SPEC 2026-11-08-atendimento-dia-a-dia, 3.3 item 1: the tags' message. */
    tag?: string;
    /** SPEC 2026-11-08-atendimento-dia-a-dia, 4.3 item 1: the checklists' message and the service to open. */
    checklist?: string;
    open?: string;
    /** SPEC 2026-11-09-comunicacao-e-calendarios, 3.3: the announcements' message. */
    announcementResult?: string;
    /** SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3: the reports' scope filter and the report to open. */
    scope?: string;
    report?: string;
    /** SF-251: the result of turning a report on or off. */
    reportSetting?: string;
    /** SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 (SF-253): the sector whose calendar is open and the result. */
    calendarSector?: string;
    sectorCalendar?: string;
  }>;
};

const adminSections = [
  { id: "overview", label: "Visão geral" },
  { id: "users", label: "Usuários" },
  // SPEC 2026-11-09-comunicacao-e-calendarios, part B.
  { id: "user-import", label: "Importar usuários" },
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 6.3.1.
  { id: "roles", label: "Papéis" },
  { id: "sectors", label: "Setores" },
  // SPEC 2026-11-08-atendimento-dia-a-dia, 3.3 item 1.
  { id: "tags", label: "Etiquetas" },
  { id: "categories", label: "Categorias" },
  { id: "services", label: "Serviços" },
  // SPEC 2026-11-08-atendimento-dia-a-dia, 4.1 item 1.
  { id: "checklists", label: "Checklists" },
  // SPEC 2026-11-07-operacao-e-automacao, 3.3 item 2.
  { id: "bundles", label: "Pacotes" },
  { id: "knowledge", label: "Base de conhecimento" },
  { id: "calendar", label: "Calendário" },
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 4.3.5.
  { id: "absences", label: "Ausências" },
  // SPEC 2026-11-07-operacao-e-automacao, 4.3 item 7.
  { id: "attendant-absences", label: "Afastamentos de atendentes" },
  // SPEC 2026-11-07-operacao-e-automacao, 5.3 item 4.
  { id: "recurring", label: "Agendas" },
  // SPEC 2026-11-07-operacao-e-automacao, part D.
  { id: "configuration", label: "Configuração portátil" },
  // SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 1.
  { id: "announcements", label: "Avisos" },
  { id: "emails", label: "E-mails" },
  { id: "dashboard", label: "Painel" },
  { id: "analytics", label: "Análises" },
  // SPEC 2026-11-08-atendimento-dia-a-dia, 5.3 item 4.
  { id: "time", label: "Horas" },
  // SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3.
  { id: "periodic-reports", label: "Relatórios" },
  { id: "audit", label: "Auditoria" },
  { id: "api-tokens", label: "Acesso à API" },
  { id: "webhooks", label: "Webhooks" },
] as const;

type AdminSection = (typeof adminSections)[number]["id"];

/** One report when `report` names one this person reads; an unknown one shows the list with a message. */
async function loadReportsScreen(scope: string | undefined, report: string | undefined) {
  // SF-251: the activation is always on the section.
  const settings = await getPeriodicReportSettings();
  if (report) {
    try {
      return { report: await getPeriodicReport(report), list: null, missing: false, settings };
    } catch (error) {
      if (!(error instanceof ApplicationError) || (error.code !== "NOT_FOUND" && error.code !== "VALIDATION_ERROR")) throw error;
      return { report: null, list: await listPeriodicReports({ scope }), missing: true, settings };
    }
  }
  return { report: null, list: await listPeriodicReports({ scope }), missing: false, settings };
}

function selectedAdminSection(section?: string): AdminSection {
  return adminSections.find((item) => item.id === section)?.id ?? "overview";
}


// SPEC 2026-11-01-aprovacoes, 9: how many active managers each sector has.
function activeManagersBySector(users: Array<{ role: string; isActive: boolean; sectorId: string | null }>) {
  const counts = new Map<string, number>();
  for (const user of users) {
    if (user.role === "MANAGER" && user.isActive && user.sectorId) {
      counts.set(user.sectorId, (counts.get(user.sectorId) ?? 0) + 1);
    }
  }
  return counts;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  try {
    await requireConfigurationAdministrator();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/");
    if (error instanceof AuthorizationError) redirect("/");
    throw error;
  }

  const [{ entity, error, notice, section, period, from, to, sector, type, actor, page, knowledge, absence, schedule, service, edit, fields, tag, checklist, open, announcementResult, scope, report, reportSetting, calendarSector, sectorCalendar }, sectors, categories, users, services, documentRequirements, serviceFields, serviceStages, permissions] =
    await Promise.all([
      searchParams,
      listSectors(),
      listCategories(),
      listUsers(),
      listServices(),
      listDocumentRequirements(),
      listServiceFields(),
      listServiceStages(),
      listPermissionOverview(),
    ]);
  const message = announcement(error, notice, entity);
  const selectedSection = selectedAdminSection(section);
  // SPEC 2026-11-01-notificacoes-email-preferencias, 5.5: read only when the section is open.
  const emailOverview = selectedSection === "emails" ? await getEmailOverview() : null;
  // SPEC 2026-11-02-painel-relatorios, 5.1: computed only when the section is open.
  const dashboard = selectedSection === "dashboard" ? await getDashboard({ period, from, to, sector }) : null;
  // SPEC 2026-11-06-analises-operacionais, 5.1: computed only when the section is open.
  const analytics = selectedSection === "analytics" ? await getAnalytics({ period, from, to, sector }) : null;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 3: the latest reports of the scope shown (a sector, or the organization).
  const analyticsReports = analytics ? await latestPeriodicReports({ sectorId: analytics.sector?.id ?? null }) : [];
  const reportsScope = analytics?.sector?.id ?? "organization";
  // SPEC 2026-11-06-base-conhecimento, 2.2: read only when the section is open.
  const knowledgeServices = selectedSection === "knowledge" ? await listArticlesForEditor() : null;
  // SPEC 2026-11-02-auditoria-lgpd, 5.2: read only when the section is open.
  const auditTrail =
    selectedSection === "audit" ? await listAuditTrail({ period, from, to, entity: type, actor, page }) : null;
  // SPEC 2026-11-02-api-externa-webhooks, 5.8: read only when the section is open.
  const apiTokens = selectedSection === "api-tokens" ? await listAllApiTokens() : null;
  // SPEC 2026-11-02-api-externa-webhooks, 5.6: read only when the section is open.
  const webhookOverview = selectedSection === "webhooks" ? await getWebhookOverview() : null;
  // SPEC 2026-11-03-pausa-sla-calendario, 5.7: read only when the section is open.
  const calendarOverview = selectedSection === "calendar" ? await getCalendarOverview() : null;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 (SF-253): the sectors' calendars, under the organization's.
  const sectorCalendarView = selectedSection === "calendar" ? await getSectorCalendarView(calendarSector) : null;
  // SPEC 2026-11-07-operacao-e-automacao, 3.3 item 2: read only when the section is open.
  const bundleOverview = selectedSection === "bundles" ? await listBundleOverview() : null;
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 7.3: read only when the section is open.
  const escalationRules = selectedSection === "sectors" ? await listEscalationRuleOverview() : null;
  // SPEC 2026-11-07-operacao-e-automacao, 4.3 item 8.
  const teamLoad = selectedSection === "sectors" ? await getTeamLoad() : null;
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 6.3: read only where roles are shown.
  const roleOverview = selectedSection === "users" || selectedSection === "roles" ? await listAccessRoleOverview() : null;
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 4.3.5: read only when the section is open.
  const attendantAbsences = selectedSection === "attendant-absences" ? await listAttendantAbsences() : null;
  // SPEC 2026-11-07-operacao-e-automacao, 5.3 item 4: read only when the section is open.
  const scheduleScreen = selectedSection === "recurring" ? await loadScheduleScreen({ schedule, service, edit, fields }) : null;
  // SPEC 2026-11-07-operacao-e-automacao, part D: read only when the section is open.
  const configurationCheck = selectedSection === "configuration" ? await checkConfigurationExport() : null;
  // SPEC 2026-11-08-atendimento-dia-a-dia, 3.3 item 1: read only when the section is open.
  const sectorTags = selectedSection === "tags" ? await listSectorTags() : null;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 1.
  const announcementOverview = selectedSection === "announcements" ? await listAnnouncementsForAdmin() : null;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4.
  const userImports = selectedSection === "user-import" ? await listUserImports() : null;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3: one report when asked, otherwise the list.
  const reportsScreen = selectedSection === "periodic-reports" ? await loadReportsScreen(scope, report) : null;
  // SPEC 2026-11-08-atendimento-dia-a-dia, 4.1 item 1: read only when the section is open.
  const serviceChecklists = selectedSection === "checklists" ? await listServiceChecklists() : null;
  // SPEC 2026-11-08-atendimento-dia-a-dia, 5.3 item 4: read only when the section is open.
  const timeReport = selectedSection === "time" ? await getTimeReport({ period, from, to, sector }) : null;
  const absencesOverview: AbsencesOverview | null =
    selectedSection === "absences"
      ? { ...(await listAbsences()), managers: await listSubstituteCandidates() }
      : null;

  return (
    <main className="page-shell">
      {/* SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 2: rendered with the page, so it is fresh on each visit. */}
      <AnnouncementStrip />
      <header className="page-header">
        <div className="page-intro">
          <p className="eyebrow">Espaço de trabalho</p>
          <h1>Administração</h1>
          <p>Gerencie usuários, setores, categorias e serviços.</p>
        </div>
        <div className="page-nav">
          {/* SPEC 2026-11-15-ajuda-faq, 2 item 4. */}
          <Link className="button-link-secondary" href="/help">
            Ajuda
          </Link>
          <Link className="button-link-secondary" href="/account/data">
            Meus dados
          </Link>
          <Link className="button-link-secondary" href="/account/password">
            Alterar senha
          </Link>
          <SignOutButton />
        </div>
      </header>
      {/* SPEC 2026-11-15-acessibilidade, 4.1 item 1: behind the "Menu" button below 760 px. */}
      <div className="admin-navigation-bar">
        <CollapsibleNav className="admin-navigation" label="Seções administrativas">
          {adminSections.map((item) => (
            <Link
              aria-current={selectedSection === item.id ? "page" : undefined}
              className={`admin-navigation-link${selectedSection === item.id ? " is-selected" : ""}`}
              href={`/admin?section=${item.id}`}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
        </CollapsibleNav>
      </div>
      {message ? (
        <p
          className={`feedback${error ? " feedback-error" : ""}`}
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      {selectedSection === "overview" ? (
        <OverviewSection
          counts={{
            users: users.length,
            sectors: sectors.length,
            categories: categories.length,
            services: services.length,
          }}
        />
      ) : null}

      {selectedSection !== "overview" ? (
        <div className="admin-sections">
      {selectedSection === "sectors" && escalationRules ? (
        <SectorsSection escalationRules={escalationRules} section={selectedSection} sectors={sectors} teamLoad={teamLoad} />
      ) : null}

      {selectedSection === "categories" ? (
        <CategoriesSection categories={categories} section={selectedSection} />
      ) : null}

      {selectedSection === "users" && roleOverview ? (
        <UsersSection permissions={permissions} roles={roleOverview} section={selectedSection} sectors={sectors} users={users} />
      ) : null}

      {selectedSection === "roles" && roleOverview ? <RolesSection roles={roleOverview.roles} /> : null}

      {bundleOverview ? <BundlesSection overview={bundleOverview} /> : null}

      {selectedSection === "services" ? (
        <ServicesSection
          categories={categories}
          documentRequirements={documentRequirements}
          serviceFields={serviceFields}
          serviceStages={serviceStages}
          activeManagersBySector={activeManagersBySector(users)}
          approvalSectors={sectors.filter((item) => item.isActive).map(({ id, name }) => ({ id, name }))}
          stageAssignees={users.flatMap((user) =>
            user.role === "ATTENDANT" && user.isActive && user.sectorId ? [{ id: user.id, name: user.name, sectorId: user.sectorId }] : [],
          )}
          section={selectedSection}
          sectors={sectors}
          services={services}
        />
      ) : null}

      {emailOverview ? <EmailsSection overview={emailOverview} /> : null}

      {dashboard ? (
        <section className="admin-section" aria-labelledby="dashboard-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Indicadores</p>
              <h2 id="dashboard-heading">Painel</h2>
              <p className="section-description">
                Números consolidados das solicitações de toda a organização ou de um setor.
              </p>
            </div>
          </div>
          <DashboardView action="/admin" dashboard={dashboard} hidden={{ section: "dashboard" }} />
        </section>
      ) : null}

      {analytics ? (
        <section className="admin-section" aria-labelledby="analytics-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Indicadores</p>
              <h2 id="analytics-heading">Análises</h2>
              <p className="section-description">
                Tendências, tempos de atendimento e distribuição do trabalho, da organização inteira ou de um setor.
              </p>
            </div>
          </div>
          <AnalyticsView action="/admin" analytics={analytics} hidden={{ section: "analytics" }} timeReport={{ action: "/admin", hidden: { section: "time" } }} />
          <LatestPeriodicReports
            allHref={`/admin?section=periodic-reports&scope=${reportsScope}`}
            detailHref={(id) => `/admin?section=periodic-reports&report=${id}`}
            reports={analyticsReports}
          />
        </section>
      ) : null}

      {knowledgeServices ? <KnowledgeEditor services={knowledgeServices} returnTo="/admin?section=knowledge" notice={knowledge} /> : null}

      {auditTrail ? <AuditSection trail={auditTrail} /> : null}

      {apiTokens ? <ApiTokensSection tokens={apiTokens} /> : null}

      {webhookOverview ? <WebhooksSection overview={webhookOverview} /> : null}

      {calendarOverview ? <CalendarSection overview={calendarOverview} /> : null}
      {sectorCalendarView ? <SectorCalendarPanel area="admin" message={sectorCalendar} view={sectorCalendarView} /> : null}

      {absencesOverview ? <AbsencesSection message={absence} overview={absencesOverview} /> : null}
      {/* SPEC 2026-11-07-operacao-e-automacao, 4.3 item 7: a section of its own. */}
      {attendantAbsences ? <AttendantAbsences area="admin" message={absence} overview={attendantAbsences} /> : null}
      {scheduleScreen ? <RecurringSchedules area="admin" screen={scheduleScreen} /> : null}
      {configurationCheck ? <ConfigurationSection check={configurationCheck} /> : null}
      {sectorTags ? <SectorTagsPanel area="admin" message={tag} sectors={sectorTags} /> : null}
      {announcementOverview ? <AnnouncementsSection message={announcementResult} overview={announcementOverview} /> : null}
      {userImports ? <UserImportSection history={userImports} /> : null}
      {reportsScreen ? <PeriodicReportsSection
          list={reportsScreen.list}
          missing={reportsScreen.missing}
          report={reportsScreen.report}
          settingResult={reportSetting}
          settings={reportsScreen.settings}
        /> : null}
      {serviceChecklists ? <ServiceChecklistsPanel area="admin" message={checklist} open={open} services={serviceChecklists} /> : null}
      {timeReport ? (
        <section className="admin-section" aria-labelledby="admin-time-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Indicadores</p>
              <h2 id="admin-time-heading">Horas</h2>
              <p className="section-description">As horas lançadas nas solicitações, da organização inteira ou de um setor.</p>
            </div>
          </div>
          <TimeReportView action="/admin" hidden={{ section: "time" }} report={timeReport} />
        </section>
      ) : null}
        </div>
      ) : null}
    </main>
  );
}
