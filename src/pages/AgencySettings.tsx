import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  Trash2,
  Loader2,
  ExternalLink,
  Save,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Paintbrush,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import { useAuth } from "@/hooks/useAuth";
import { agencyNameToSlug } from "@/utils/agency";
import { agenciesService, AGENCY_NAME_TAKEN_CODE } from "@/services/agencies";
import { Agency } from "@/config/supabase";
import { listingsService } from "@/services/listings";
import "@/styles/editor.css";

interface FormState {
  name: string;
  logo_url: string;
  banner_url: string;
  phone: string;
  email: string;
  website: string;
  about_html: string;
}

const DUPLICATE_AGENCY_NAME_MESSAGE =
  "That agency name is already taken. Please choose a unique name.";

function isAgencyNameTakenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === AGENCY_NAME_TAKEN_CODE
  );
}

export function AgencySettings() {
  const { user, profile, loading: authLoading } = useAuth();
  const agencyName = profile?.agency?.trim() ?? "";
  const slug = useMemo(() => agencyNameToSlug(agencyName), [agencyName]);
  const canManageAgency =
    profile?.role === "agent" &&
    agencyName.length > 0 &&
    profile?.can_manage_agency === true;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: agencyName,
    logo_url: "",
    banner_url: "",
    phone: "",
    email: "",
    website: "",
    about_html: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const initialEditorSyncRef = useRef(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-[#273140] underline",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: "",
    onUpdate({ editor }) {
      setSuccess(null);
      setFormState((prev) => ({
        ...prev,
        about_html: editor.getHTML(),
      }));
    },
  });

  const toolbarButtonClass = (active?: boolean) =>
    `inline-flex items-center justify-center rounded-md border px-2 py-1 text-sm transition-colors ${
      active
        ? "border-[#273140] bg-[#273140] text-white"
        : "border-gray-200 text-gray-600 hover:bg-gray-100"
    }`;

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const loadAgencyDetails = useCallback(async () => {
    if (!slug) {
      setAgency(null);
      setNameError(null);
      initialEditorSyncRef.current = false;
      setFormState({
        name: agencyName,
        logo_url: "",
        banner_url: "",
        phone: "",
        email: "",
        website: "",
        about_html: "",
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await agenciesService.getAgencyBySlug(slug);
      setAgency(data);

      const nextState: FormState = {
        name: data?.name?.trim() || agencyName,
        logo_url: data?.logo_url ?? "",
        banner_url: data?.banner_url ?? "",
        phone: data?.phone ?? "",
        email: data?.email ?? "",
        website: data?.website ?? "",
        about_html: data?.about_html ?? "",
      };

      initialEditorSyncRef.current = false;
      setFormState(nextState);
      setNameError(null);
    } catch (err) {
      console.error("Error loading agency settings:", err);
      setAgency(null);
      setNameError(null);
      initialEditorSyncRef.current = false;
      setFormState({
        name: agencyName,
        logo_url: "",
        banner_url: "",
        phone: "",
        email: "",
        website: "",
        about_html: "",
      });
      setError("Failed to load agency settings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [agencyName, slug]);

  useEffect(() => {
    if (!canManageAgency || !slug) {
      setLoading(false);
      return;
    }

    loadAgencyDetails();
  }, [canManageAgency, slug, loadAgencyDetails]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (initialEditorSyncRef.current) {
      return;
    }

    editor.commands.setContent(formState.about_html || "<p></p>");
    initialEditorSyncRef.current = true;
  }, [editor, formState.about_html]);

  const handleInputChange = (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setSuccess(null);
      if (field === "name") {
        setNameError(null);
      }
      setFormState((prev) => ({ ...prev, [field]: value }));
    };

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!user) {
      setError("You must be signed in to upload images.");
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setLogoUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const { publicUrl } = await listingsService.uploadTempListingImage(
        file,
        user.id,
      );
      setFormState((prev) => ({ ...prev, logo_url: publicUrl }));
    } catch (err) {
      console.error("Error uploading logo:", err);
      setError("Failed to upload logo. Please try again.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBannerUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!user) {
      setError("You must be signed in to upload images.");
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setBannerUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const { publicUrl } = await listingsService.uploadTempListingImage(
        file,
        user.id,
      );
      setFormState((prev) => ({ ...prev, banner_url: publicUrl }));
    } catch (err) {
      console.error("Error uploading banner:", err);
      setError("Failed to upload banner. Please try again.");
    } finally {
      setBannerUploading(false);
    }
  };

  const handleToggleLink = () => {
    if (!editor) {
      return;
    }

    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter link URL", previous || "https://");

    if (url === null || url.trim() === "") {
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
      })
      .run();
  };

  const handleCreateAgency = async () => {
    if (!slug || agencyName.length === 0) {
      return;
    }

    const trimmedName = agencyName.trim();
    if (!trimmedName) {
      setError("Agency name is required.");
      return;
    }

    setError(null);
    setSuccess(null);
    setNameError(null);

    try {
      const availability = await agenciesService.checkAgencyNameAvailable(
        trimmedName,
      );

      if (!availability.available) {
        setNameError(DUPLICATE_AGENCY_NAME_MESSAGE);
        return;
      }
    } catch (err) {
      console.error("Error verifying agency availability:", err);
      setError("Failed to verify agency name availability. Please try again.");
      return;
    }

    setCreating(true);

    try {
      const created = await agenciesService.createAgency({
        name: trimmedName,
        slug,
      });

      setAgency(created);
      const nextState: FormState = {
        name: created?.name?.trim() || trimmedName,
        logo_url: created?.logo_url ?? "",
        banner_url: created?.banner_url ?? "",
        phone: created?.phone ?? "",
        email: created?.email ?? "",
        website: created?.website ?? "",
        about_html: created?.about_html ?? "",
      };

      initialEditorSyncRef.current = false;
      setFormState(nextState);
      setNameError(null);
      setSuccess("Agency profile created. You can now customize your branding.");
    } catch (err) {
      console.error("Error creating agency:", err);
      if (isAgencyNameTakenError(err)) {
        setNameError(DUPLICATE_AGENCY_NAME_MESSAGE);
      } else {
        setError("Failed to create agency profile. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!agency) {
      return;
    }

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setError("Agency name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    setNameError(null);

    try {
      const availability = await agenciesService.checkAgencyNameAvailable(
        trimmedName,
        agency.id,
      );

      if (!availability.available) {
        setNameError(DUPLICATE_AGENCY_NAME_MESSAGE);
        return;
      }

      const payload = {
        name: trimmedName,
        logo_url: toNullable(formState.logo_url),
        banner_url: toNullable(formState.banner_url),
        phone: toNullable(formState.phone),
        email: toNullable(formState.email),
        website: toNullable(formState.website),
        about_html: formState.about_html,
      };

      const updated = await agenciesService.updateAgencyById(
        agency.id,
        payload,
      );

      const nextAgency = updated ?? agency;
      setAgency(nextAgency);

      const nextState: FormState = {
        name: nextAgency.name?.trim() || trimmedName,
        logo_url: nextAgency.logo_url ?? "",
        banner_url: nextAgency.banner_url ?? "",
        phone: nextAgency.phone ?? "",
        email: nextAgency.email ?? "",
        website: nextAgency.website ?? "",
        about_html: nextAgency.about_html ?? "",
      };

      initialEditorSyncRef.current = false;
      setFormState(nextState);
      setNameError(null);
      setSuccess("Agency profile updated successfully.");
    } catch (err) {
      console.error("Error saving agency settings:", err);
      if (isAgencyNameTakenError(err)) {
        setNameError(DUPLICATE_AGENCY_NAME_MESSAGE);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save agency settings. Please try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const isUnauthorized =
    !authLoading && (!user || !canManageAgency || !slug);

  if (isUnauthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mb-4" />
          <p className="text-gray-600">Loading agency settings...</p>
        </div>
      </div>
    );
  }

  const handleRemoveLogo = () => {
    setSuccess(null);
    setFormState((prev) => ({ ...prev, logo_url: "" }));
  };

  const handleRemoveBanner = () => {
    setSuccess(null);
    setFormState((prev) => ({ ...prev, banner_url: "" }));
  };

  const isSavingDisabled = saving || logoUploading || bannerUploading;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#273140] mb-1">
            Agency Branding
          </h1>
          <p className="text-gray-600">
            Customize the public profile and contact details for your agency.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          {slug && (
            <a
              href={`/agencies/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[#273140] bg-[#273140] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1f2935]"
            >
              <ExternalLink className="w-4 h-4" />
              View Live
            </a>
          )}
        </div>
      </div>

      {slug && (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-[#f9f4ed] px-4 py-3 text-sm text-[#273140]">
          Public URL: <span className="font-semibold">/agencies/{slug}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {!agency ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0e7da]">
            <Paintbrush className="h-6 w-6 text-[#273140]" />
          </div>
          <h2 className="text-xl font-semibold text-[#273140] mb-2">
            Set up your agency profile
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto mb-6">
            Create an agency record to control the branding, contact details, and
            about section that appear on your public agency page.
          </p>
          <button
            type="button"
            onClick={handleCreateAgency}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md bg-[#273140] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1f2935] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paintbrush className="w-4 h-4" />
            )}
            {creating ? "Creating..." : "Create Agency Profile"}
          </button>
          {nameError && (
            <p className="mt-4 text-sm text-red-600">{nameError}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agency Display Name
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={handleInputChange("name")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#273140] focus:outline-none focus:ring-2 focus:ring-[#273140]/20"
                placeholder="Agency name"
                maxLength={120}
              />
              {nameError && (
                <p className="mt-2 text-sm text-red-600">{nameError}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                This name appears at the top of your public agency page.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Logo
                  </label>
                  {formState.logo_url && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#273140]"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-dashed border-gray-300 bg-gray-50">
                    {formState.logo_url ? (
                      <img
                        src={formState.logo_url}
                        alt="Agency logo preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">No logo</span>
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
                    {logoUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>{logoUploading ? "Uploading..." : "Upload Logo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={logoUploading}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Recommended: square PNG with transparent background.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Banner
                  </label>
                  {formState.banner_url && (
                    <button
                      type="button"
                      onClick={handleRemoveBanner}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#273140]"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
                <div className="relative h-32 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
                  {formState.banner_url ? (
                    <img
                      src={formState.banner_url}
                      alt="Agency banner preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">
                      No banner uploaded
                    </div>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
                  {bannerUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{bannerUploading ? "Uploading..." : "Upload Banner"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBannerUpload}
                    disabled={bannerUploading}
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Recommended: 1200x400 JPG or PNG.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold text-[#273140]">
              Contact Details
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formState.phone}
                  onChange={handleInputChange("phone")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#273140] focus:outline-none focus:ring-2 focus:ring-[#273140]/20"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formState.email}
                  onChange={handleInputChange("email")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#273140] focus:outline-none focus:ring-2 focus:ring-[#273140]/20"
                  placeholder="hello@agency.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={formState.website}
                  onChange={handleInputChange("website")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#273140] focus:outline-none focus:ring-2 focus:ring-[#273140]/20"
                  placeholder="https://example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Include the full URL so visitors can navigate directly to your site.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#273140]">About</h2>
              <span className="text-sm text-gray-500">
                Share your mission, experience, or specialties.
              </span>
            </div>
            <div className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  disabled={!editor}
                  className={`${toolbarButtonClass(editor?.isActive("bold"))} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  disabled={!editor}
                  className={`${toolbarButtonClass(editor?.isActive("italic"))} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor?.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  disabled={!editor}
                  className={`${toolbarButtonClass(
                    editor?.isActive("heading", { level: 2 }),
                  )} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  disabled={!editor}
                  className={`${toolbarButtonClass(editor?.isActive("bulletList"))} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor?.chain().focus().toggleOrderedList().run()
                  }
                  disabled={!editor}
                  className={`${toolbarButtonClass(editor?.isActive("orderedList"))} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleLink}
                  disabled={!editor}
                  className={`${toolbarButtonClass(editor?.isActive("link"))} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <LinkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="editor-shell">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isSavingDisabled}
              className="inline-flex items-center gap-2 rounded-md bg-[#273140] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1f2935] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
