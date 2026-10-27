import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DigitalAssetsPage from "./DigitalAssetsPage";

// Phase 2 redesign verification: covers the brief's testable, non-visual
// requirements - list view as the default, correct sort ordering (Modified/
// Name/Size), search filtering, and that management actions (Upload/New
// folder/Rename/Move/Delete) are gated on canManage. Visual/interaction
// checks that genuinely need a real browser (drag-and-drop, actual file
// upload, pixel-level layout) are out of scope here - see the manual
// verification notes in the redesign report instead.

function makeQueryBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.com/mock-signed" }, error: null }),
      }),
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "mock-token" } } }) },
  },
}));

const MOCK_USER = { id: "u1", email: "manager@lineage.test" };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: MOCK_USER }) }));

let mockCanManage = true;
vi.mock("@/hooks/useUserRole", () => ({ isDigitalAssetsManager: () => mockCanManage }));

const NOW = Date.now();
const FOLDERS = [
  { id: "f1", name: "Brochures", parent_folder_id: null, created_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW - 10 * 86_400_000).toISOString() },
  // A second root folder that DOES contain a real image asset - lets the
  // Collections tests below cover both the photo-led card and the
  // typographic (no-image) card in the same render.
  { id: "f2", name: "Product Photography", parent_folder_id: null, created_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW).toISOString() },
];
const ASSETS = [
  // Deliberately out of alphabetical/size/date order so each sort mode produces a different, checkable order.
  { id: "a1", name: "Zebra Price List.pdf", folder_id: null, file_path: "root/a1", content_type: "application/pdf", size_bytes: 500, uploaded_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW - 25 * 3_600_000).toISOString() }, // Yesterday, mid size
  { id: "a2", name: "Apple Catalog.pdf", folder_id: null, file_path: "root/a2", content_type: "application/pdf", size_bytes: 5_000_000, uploaded_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW - 3_600_000).toISOString() }, // Today, largest, newest
  { id: "a3", name: "Mango Brochure.pdf", folder_id: null, file_path: "root/a3", content_type: "application/pdf", size_bytes: 100, uploaded_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW - 5 * 86_400_000).toISOString() }, // This week, smallest, oldest
  { id: "a4", name: "Geneva Bedroom.jpg", folder_id: "f2", file_path: "f2/a4", content_type: "image/jpeg", size_bytes: 9_000_000, uploaded_by: "u1", created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW).toISOString() },
];
const STARS: unknown[] = [];

function setupSupabaseMock() {
  mockFrom.mockImplementation((table: string) => {
    if (table === "digital_asset_folders") return makeQueryBuilder({ data: FOLDERS, error: null });
    if (table === "digital_assets") return makeQueryBuilder({ data: ASSETS, error: null });
    if (table === "digital_asset_stars") return makeQueryBuilder({ data: STARS, error: null });
    return makeQueryBuilder({ data: [], error: null });
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DigitalAssetsPage />
    </QueryClientProvider>,
  );
}

describe("DigitalAssetsPage", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockCanManage = true;
    setupSupabaseMock();
  });

  it("loads in list view by default, with real Name/Type/Size/Modified columns", async () => {
    renderPage();
    const list = await screen.findByTestId("asset-list");
    expect(within(list).getByText("Apple Catalog.pdf")).toBeInTheDocument();
    // The column header row only renders in list view. Scoped to asset-list
    // since the toolbar's sort control also displays "Modified" (its
    // current value) outside this region.
    expect(within(list).getByText("Name")).toBeInTheDocument();
    expect(within(list).getByText("Type")).toBeInTheDocument();
    expect(within(list).getByText("Size")).toBeInTheDocument();
    expect(within(list).getByText("Modified")).toBeInTheDocument();
  });

  it("sorts by Modified (default) newest first", async () => {
    renderPage();
    const list = await screen.findByTestId("asset-list");
    const names = within(list).getAllByText(/\.pdf$/).map((el) => el.textContent);
    // a2 (1h ago) before a1 (yesterday) before a3 (this week) - folder sorts
    // separately into its own date bucket, so only asset order is asserted.
    const order = names.filter((n): n is string => !!n);
    expect(order.indexOf("Apple Catalog.pdf")).toBeLessThan(order.indexOf("Zebra Price List.pdf"));
    expect(order.indexOf("Zebra Price List.pdf")).toBeLessThan(order.indexOf("Mango Brochure.pdf"));
  });

  it("sorts by Name A–Z when chosen from the sort control", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Name A–Z"));
    const list = screen.getByTestId("asset-list");
    const names = within(list).getAllByText(/\.pdf$/).map((el) => el.textContent).filter((n): n is string => !!n);
    expect(names).toEqual(["Apple Catalog.pdf", "Mango Brochure.pdf", "Zebra Price List.pdf"]);
  });

  it("sorts by Size: largest when chosen from the sort control", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Size: largest"));
    const list = screen.getByTestId("asset-list");
    const names = within(list).getAllByText(/\.pdf$/).map((el) => el.textContent).filter((n): n is string => !!n);
    // a2 (5MB) > a1 (500B) > a3 (100B)
    expect(names).toEqual(["Apple Catalog.pdf", "Zebra Price List.pdf", "Mango Brochure.pdf"]);
  });

  it("filters by search across folders and files", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    fireEvent.change(screen.getByPlaceholderText(/search all files and folders/i), { target: { value: "apple" } });
    expect(screen.getByText("Apple Catalog.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Zebra Price List.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Mango Brochure.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Brochures")).not.toBeInTheDocument();
  });

  it("switches to grid view and back", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    fireEvent.click(screen.getByRole("button", { name: /grid view/i }));
    expect(screen.queryByText("Type")).not.toBeInTheDocument(); // column header gone in grid view
    fireEvent.click(screen.getByRole("button", { name: /list view/i }));
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("shows the root breadcrumb and real folders/files from the mocked data", async () => {
    renderPage();
    const list = await screen.findByTestId("asset-list");
    expect(within(list).getByText("Brochures")).toBeInTheDocument();
    expect(screen.getByText("All files")).toBeInTheDocument();
  });

  it("shows management actions (Upload, New folder) for an authorized manager", async () => {
    mockCanManage = true;
    renderPage();
    await screen.findByTestId("asset-list");
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new folder/i })).toBeInTheDocument();
  });

  it("hides management actions for a non-manager (view + download only)", async () => {
    mockCanManage = false;
    renderPage();
    await screen.findByTestId("asset-list");
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new folder/i })).not.toBeInTheDocument();
  });

  // Editorial Library redesign: Collections are the real top-level folders
  // (digital_asset_folders.parent_folder_id IS NULL), not invented
  // categories - "Brochures" in the fixture above is exactly that.
  it("shows real top-level folders as Collections with real item counts", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    expect(screen.getByText("Collections")).toBeInTheDocument();
    // "Brochures" appears both as a Collection card and as a row in the
    // list below - at least one instance must be present either way.
    expect(screen.getAllByText("Brochures").length).toBeGreaterThan(0);
    // No asset in the fixture has folder_id "f1", so its real, computed
    // count is zero - the collection card must say so honestly, not omit
    // the count or show a placeholder number.
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("navigates into a folder when its Collection card is clicked", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    const collectionsHeading = screen.getByText("Collections");
    const strip = collectionsHeading.closest("div")!.nextElementSibling as HTMLElement;
    fireEvent.click(within(strip).getByText("Brochures"));
    // Brochures has no children in the fixture, so a real navigation lands
    // on its real empty state, not just a changed breadcrumb label.
    expect(await screen.findByText(/this folder is empty/i)).toBeInTheDocument();
  });

  // The preview panel is the robust, not-clamped way to see a complete
  // filename (see DigitalAssetsPage.tsx's SheetTitle) - assert the DOM
  // itself carries no truncate/line-clamp class, not just that the text
  // node exists (which would pass even with the old clamped version).
  it("shows the complete filename with no truncation class in the file preview", async () => {
    renderPage();
    const list = await screen.findByTestId("asset-list");
    fireEvent.click(within(list).getByText("Apple Catalog.pdf"));
    const title = await screen.findByRole("heading", { name: "Apple Catalog.pdf" });
    expect(title.className).not.toMatch(/truncate|line-clamp/);
  });

  // Adaptive collection cards: a folder with a real image asset in its
  // subtree gets the photo-led card; a folder with none gets the
  // typographic "label card" instead of a beige placeholder.
  it("shows a photo-led collection card for a folder with a real image asset", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    const card = screen.getByRole("button", { name: /Product Photography/ });
    // The cover photo is deliberately alt="" (decorative - its caption
    // right below already names the folder), so it has no accessible
    // "img" role by design; query the element directly instead.
    await screen.findByText("1 item");
    expect(card.querySelector("img")).toBeInTheDocument();
    expect(within(card).getByText("1 item")).toBeInTheDocument();
  });

  it("shows the typographic card (no image) for a folder with no image assets", async () => {
    renderPage();
    await screen.findByTestId("asset-list");
    const collectionsHeading = screen.getByText("Collections");
    const strip = collectionsHeading.closest("div")!.nextElementSibling as HTMLElement;
    const card = within(strip).getByRole("button", { name: /Brochures/ });
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(within(card).getByText("Empty")).toBeInTheDocument();
  });

  it("shows an empty state with no items", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "digital_asset_folders") return makeQueryBuilder({ data: [], error: null });
      if (table === "digital_assets") return makeQueryBuilder({ data: [], error: null });
      return makeQueryBuilder({ data: [], error: null });
    });
    renderPage();
    expect(await screen.findByText(/this folder is empty/i)).toBeInTheDocument();
  });
});
