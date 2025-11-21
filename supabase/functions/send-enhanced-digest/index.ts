import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type DigestTemplateType =
  | 'unsent_only'
  | 'recent_by_category'
  | 'filter_links'
  | 'custom_query'
  | 'mixed_layout'
  | 'all_active';

type DigestSortOption =
  | 'newest_first'
  | 'price_asc'
  | 'price_desc'
  | 'featured_first';

interface FilterConfig {
  bedrooms?: number[];
  price_min?: number;
  price_max?: number;
  locations?: string[];
  property_types?: string[];
  broker_fee?: boolean;
  date_range_days?: number;
  parking?: string;
  lease_length?: string;
}

interface CategoryLimits {
  studio?: number;
  '1bed'?: number;
  '2bed'?: number;
  '3bed'?: number;
  '4plus'?: number;
  [key: string]: number | undefined;
}

interface DigestTemplate {
  id: string;
  name: string;
  description?: string;
  template_type: DigestTemplateType;
  filter_config: FilterConfig;
  category_limits: CategoryLimits;
  sort_preference: DigestSortOption;
  allow_resend: boolean;
  resend_after_days: number;
  ignore_send_history: boolean;
  subject_template: string;
  include_filter_links: boolean;
  filter_preset_ids: string[];
  created_by?: string;
  is_default: boolean;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  category: string;
  filter_params: Record<string, any>;
  display_label: string;
  display_order: number;
  short_code?: string;
  usage_count: number;
  last_used_at?: string;
  created_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Listing {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  parking: string;
  broker_fee: boolean;
  location: string;
  neighborhood: string | null;
  property_type: string;
  lease_length: string;
  is_featured: boolean;
  additional_rooms: number | null;
  created_at: string;
  updated_at: string;
  owner: {
    full_name: string;
    role: string;
    agency: string | null;
  };
}

interface FilterLinkWithCount {
  preset_id: string;
  label: string;
  count: number;
  url: string;
  short_url?: string;
}

interface DigestRequestBody {
  template_id?: string;
  template_config?: Partial<DigestTemplate>;
  dry_run?: boolean;
  force?: boolean;
  recipient_emails?: string[];
}

interface DigestResponse {
  success: boolean;
  dry_run?: boolean;
  listingCount: number;
  adminCount: number;
  template_name?: string;
  template_type?: DigestTemplateType;
  listings_by_category?: Record<string, number>;
  filter_links?: FilterLinkWithCount[];
  digest_send_id?: string;
  message?: string;
}

interface CategoryGroup {
  label: string;
  key: string;
  listings: Listing[];
  limit?: number;
}

// ============================================================================
// QUERY BUILDER
// ============================================================================

async function buildListingsQuery(
  supabase: SupabaseClient,
  filterConfig: FilterConfig,
  sortPreference: DigestSortOption = 'newest_first'
): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      price,
      call_for_price,
      bedrooms,
      bathrooms,
      parking,
      broker_fee,
      location,
      neighborhood,
      property_type,
      lease_length,
      is_featured,
      additional_rooms,
      created_at,
      updated_at,
      owner:profiles!listings_user_id_fkey(full_name, role, agency)
    `)
    .eq('approved', true)
    .eq('is_active', true);

  if (filterConfig.date_range_days) {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - filterConfig.date_range_days);
    query = query.gte('updated_at', dateThreshold.toISOString());
  }

  if (filterConfig.bedrooms && filterConfig.bedrooms.length > 0) {
    query = query.in('bedrooms', filterConfig.bedrooms);
  }

  if (filterConfig.price_min !== undefined) {
    query = query.gte('price', filterConfig.price_min);
  }
  if (filterConfig.price_max !== undefined) {
    query = query.lte('price', filterConfig.price_max);
  }

  if (filterConfig.locations && filterConfig.locations.length > 0) {
    query = query.in('location', filterConfig.locations);
  }

  if (filterConfig.property_types && filterConfig.property_types.length > 0) {
    query = query.in('property_type', filterConfig.property_types);
  }

  if (filterConfig.broker_fee !== undefined) {
    query = query.eq('broker_fee', filterConfig.broker_fee);
  }

  if (filterConfig.parking) {
    query = query.eq('parking', filterConfig.parking);
  }

  if (filterConfig.lease_length) {
    query = query.eq('lease_length', filterConfig.lease_length);
  }

  switch (sortPreference) {
    case 'newest_first':
      query = query.order('created_at', { ascending: false });
      break;
    case 'price_asc':
      query = query.order('price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false, nullsFirst: false });
      break;
    case 'featured_first':
      query = query.order('is_featured', { ascending: false })
                   .order('created_at', { ascending: false });
      break;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch listings: ${error.message}`);
  }

  return (data || []) as Listing[];
}

async function getListingCount(
  supabase: SupabaseClient,
  filterParams: Record<string, any>
): Promise<number> {
  let query = supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('approved', true)
    .eq('is_active', true);

  if (filterParams.bedrooms !== undefined) {
    query = query.eq('bedrooms', filterParams.bedrooms);
  }

  if (filterParams.price_min !== undefined) {
    query = query.gte('price', filterParams.price_min);
  }

  if (filterParams.price_max !== undefined) {
    query = query.lte('price', filterParams.price_max);
  }

  if (filterParams.location) {
    query = query.eq('location', filterParams.location);
  }

  if (filterParams.neighborhood) {
    query = query.eq('neighborhood', filterParams.neighborhood);
  }

  if (filterParams.property_type) {
    query = query.eq('property_type', filterParams.property_type);
  }

  if (filterParams.broker_fee !== undefined) {
    query = query.eq('broker_fee', filterParams.broker_fee);
  }

  if (filterParams.parking) {
    query = query.eq('parking', filterParams.parking);
  }

  if (filterParams.lease_length) {
    query = query.eq('lease_length', filterParams.lease_length);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error counting listings:', error);
    return 0;
  }

  return count || 0;
}

function buildFilterUrl(filterParams: Record<string, any>): string {
  const params = new URLSearchParams();

  if (filterParams.bedrooms !== undefined) {
    params.set('bedrooms', filterParams.bedrooms.toString());
  }

  if (filterParams.price_min !== undefined) {
    params.set('minPrice', filterParams.price_min.toString());
  }

  if (filterParams.price_max !== undefined) {
    params.set('maxPrice', filterParams.price_max.toString());
  }

  if (filterParams.location) {
    params.set('location', filterParams.location);
  }

  if (filterParams.neighborhood) {
    params.set('neighborhood', filterParams.neighborhood);
  }

  if (filterParams.property_type) {
    params.set('propertyType', filterParams.property_type);
  }

  if (filterParams.broker_fee !== undefined) {
    params.set('brokerFee', filterParams.broker_fee.toString());
  }

  if (filterParams.parking) {
    params.set('parking', filterParams.parking);
  }

  if (filterParams.lease_length) {
    params.set('leaseLength', filterParams.lease_length);
  }

  return `/browse?${params.toString()}`;
}

// ============================================================================
// CATEGORIZER
// ============================================================================

function categorizeByBedrooms(
  listings: Listing[],
  limits: CategoryLimits = {}
): CategoryGroup[] {
  const categories: CategoryGroup[] = [
    { label: 'Studio Apartments', key: 'studio', listings: [], limit: limits.studio },
    { label: '1 Bedroom', key: '1bed', listings: [], limit: limits['1bed'] },
    { label: '2 Bedrooms', key: '2bed', listings: [], limit: limits['2bed'] },
    { label: '3 Bedrooms', key: '3bed', listings: [], limit: limits['3bed'] },
    { label: '4+ Bedrooms', key: '4plus', listings: [], limit: limits['4plus'] },
  ];

  for (const listing of listings) {
    if (listing.bedrooms === 0) {
      categories[0].listings.push(listing);
    } else if (listing.bedrooms === 1) {
      categories[1].listings.push(listing);
    } else if (listing.bedrooms === 2) {
      categories[2].listings.push(listing);
    } else if (listing.bedrooms === 3) {
      categories[3].listings.push(listing);
    } else if (listing.bedrooms >= 4) {
      categories[4].listings.push(listing);
    }
  }

  for (const category of categories) {
    if (category.limit && category.limit > 0) {
      category.listings = category.listings.slice(0, category.limit);
    }
  }

  return categories.filter(cat => cat.listings.length > 0);
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

function formatPrice(listing: Listing): string {
  if (listing.call_for_price) return "Call for Price";
  if (listing.price != null) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(listing.price);
  }
  return "Price Not Available";
}

function getBedroomDisplay(listing: Listing): string {
  if (listing.bedrooms === 0) return "Studio";
  if (listing.additional_rooms && listing.additional_rooms > 0) {
    return `${listing.bedrooms}+${listing.additional_rooms} bed`;
  }
  return `${listing.bedrooms} bed`;
}

function getBathroomDisplay(bathrooms: number): string {
  return `${bathrooms} bath`;
}

function getParkingDisplay(parking: string): string {
  return parking === "yes" || parking === "included" ? "Parking" : "";
}

function getPropertyTypeDisplay(propertyType: string): string {
  if (propertyType === "basement") return "Basement";
  if (propertyType === "full_house") return "Full House";
  if (propertyType === "duplex") return "Duplex";
  if (propertyType === "apartment_in_building" || propertyType === "apartment_in_house") return "Apartment";
  return "";
}

function getLeaseDisplay(leaseLength: string): string {
  if (leaseLength === "short_term") return "Short Term";
  return "";
}

function renderListingCard(listing: Listing, listingUrl: string): string {
  const hasParking = getParkingDisplay(listing.parking);
  const locationWithNeighborhood = listing.neighborhood
    ? `${listing.neighborhood}, ${listing.location}`
    : listing.location;

  const ownerDisplay =
    listing.owner?.role === "agent" && listing.owner?.agency
      ? listing.owner.agency
      : "Owner";

  let specs = `${getBedroomDisplay(listing)} | ${getBathroomDisplay(listing.bathrooms)}`;
  if (hasParking) {
    specs += ` | ${hasParking}`;
  }
  specs += ` | ${listing.broker_fee ? "Broker Fee" : "No Fee"}`;

  const propertyType = getPropertyTypeDisplay(listing.property_type);
  const leaseType = getLeaseDisplay(listing.lease_length);
  if (propertyType || leaseType) {
    const extras = [propertyType, leaseType].filter((x) => x).join(", ");
    specs += ` - ${extras}`;
  }

  const featuredBadge = listing.is_featured ? " (FEATURED)" : "";

  return `${formatPrice(listing)}
${specs}
${locationWithNeighborhood}
Posted by ${ownerDisplay}${featuredBadge}
${listingUrl}
`;
}

async function renderCategorySection(
  category: CategoryGroup,
  siteUrl: string,
  createShortUrl: (listingId: string, originalUrl: string) => Promise<string>
): Promise<string> {
  let section = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${category.label.toUpperCase()} (${category.listings.length})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  for (const listing of category.listings) {
    const listingUrl = await createShortUrl(
      listing.id,
      `${siteUrl}/listing/${listing.id}`
    );
    section += renderListingCard(listing, listingUrl) + "\n";
  }

  return section;
}

function renderFilterLink(link: FilterLinkWithCount, siteUrl: string): string {
  const url = link.short_url || `${siteUrl}${link.url}`;
  return `${link.label} (${link.count} available)
${url}
`;
}

async function renderPlainTextEmail(
  categories: CategoryGroup[],
  filterLinks: FilterLinkWithCount[],
  siteUrl: string,
  totalActive: number,
  createShortUrl: (listingId: string, originalUrl: string) => Promise<string>
): Promise<string> {
  const roundedCount = Math.floor(totalActive / 10) * 10;

  let email = `Here are the latest apartments posted on Hadirot:

To see all ${roundedCount}+ active apartments:
${siteUrl}/browse

`;

  if (filterLinks.length > 0) {
    email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BROWSE BY CATEGORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    for (const link of filterLinks) {
      email += renderFilterLink(link, siteUrl) + "\n";
    }
    email += "\n";
  }

  for (const category of categories) {
    const section = await renderCategorySection(category, siteUrl, createShortUrl);
    email += section;
  }

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Join the Hadirot WhatsApp Community:
https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt`;

  return email;
}

function generateEmailSubject(
  templateName: string,
  subjectTemplate: string,
  listingCount: number
): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return subjectTemplate
    .replace("{{date}}", currentDate)
    .replace("{{count}}", listingCount.toString())
    .replace("{{template}}", templateName);
}

// ============================================================================
// ZEPTO EMAIL SERVICE
// ============================================================================

const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

interface ZeptoParams {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
}

async function sendViaZepto({ to, subject, html, fromName }: ZeptoParams) {
  const token = Deno.env.get("ZEPTO_TOKEN");
  const address = Deno.env.get("ZEPTO_FROM_ADDRESS") || "";
  const name = fromName || Deno.env.get("ZEPTO_FROM_NAME") || "";

  if (!token || !address || !name) {
    throw new Error("ZeptoMail is not configured");
  }

  const toList = Array.isArray(to) ? to : [to];
  const htmlFormatted = `<pre style="font-family: inherit; white-space: pre-wrap; word-wrap: break-word;">${html}</pre>`;

  const payload = {
    from: { address, name },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody: htmlFormatted,
    textbody: html,
    track_opens: false,
    track_clicks: false,
  };

  const res = await fetch(ZEPTO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZeptoMail error: ${res.status} ${text}`);
  }
  return await res.json();
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log("📧 Starting enhanced digest email job");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden", message: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: DigestRequestBody = await req.json();
    const { template_id, template_config, dry_run = false, recipient_emails } = body;

    console.log(`📋 Request: template_id=${template_id}, dry_run=${dry_run}`);

    let template: DigestTemplate;
    if (template_id) {
      const { data, error } = await supabaseAdmin
        .from("digest_templates")
        .select("*")
        .eq("id", template_id)
        .maybeSingle();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Not found", message: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      template = data as DigestTemplate;
    } else if (template_config) {
      template = {
        id: "inline",
        name: template_config.name || "Ad-hoc Digest",
        template_type: template_config.template_type || "unsent_only",
        filter_config: template_config.filter_config || {},
        category_limits: template_config.category_limits || {},
        sort_preference: template_config.sort_preference || "newest_first",
        allow_resend: template_config.allow_resend || false,
        resend_after_days: template_config.resend_after_days || 7,
        ignore_send_history: template_config.ignore_send_history || false,
        subject_template: template_config.subject_template || "Listing Digest - {{date}}",
        include_filter_links: template_config.include_filter_links || false,
        filter_preset_ids: template_config.filter_preset_ids || [],
        is_default: false,
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as DigestTemplate;
    } else {
      const { data } = await supabaseAdmin
        .from("digest_templates")
        .select("*")
        .eq("is_default", true)
        .eq("template_type", "unsent_only")
        .maybeSingle();

      if (!data) {
        return new Response(
          JSON.stringify({ error: "Configuration error", message: "No default template found" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      template = data as DigestTemplate;
    }

    console.log(`✅ Using template: ${template.name} (${template.template_type})`);

    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_admin", true);

    const adminIds = adminProfiles?.map(p => p.id) || [];
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();

    let adminEmails: string[];
    if (recipient_emails && recipient_emails.length > 0) {
      adminEmails = recipient_emails;
    } else {
      const adminIdSet = new Set(adminIds);
      adminEmails = users
        ?.filter(u => adminIdSet.has(u.id))
        .map(u => u.email)
        .filter((email): email is string => !!email) || [];
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "Configuration error", message: "No admin email addresses found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`👥 Found ${adminEmails.length} recipient(s)`);

    let allListings = await buildListingsQuery(
      supabaseAdmin,
      template.filter_config,
      template.sort_preference
    );

    console.log(`📦 Found ${allListings.length} listings matching filters`);

    let listingsToSend: Listing[] = [];

    if (template.ignore_send_history) {
      listingsToSend = allListings;
      console.log(`📝 Ignore send history: sending all ${listingsToSend.length} listings`);
    } else if (template.template_type === "unsent_only") {
      const { data: sentListings } = await supabaseAdmin
        .from("digest_sent_listings")
        .select("listing_id");

      const sentIds = new Set(sentListings?.map(s => s.listing_id) || []);
      listingsToSend = allListings.filter(l => !sentIds.has(l.id));
      console.log(`📝 Unsent only: ${listingsToSend.length} of ${allListings.length} listings are new`);
    } else if (template.allow_resend) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - template.resend_after_days);

      const { data: recentSends } = await supabaseAdmin
        .from("digest_sent_listings")
        .select("listing_id")
        .gte("sent_at", thresholdDate.toISOString());

      const recentIds = new Set(recentSends?.map(s => s.listing_id) || []);
      listingsToSend = allListings.filter(l => !recentIds.has(l.id));
      console.log(`📝 Allow resend: ${listingsToSend.length} of ${allListings.length} listings eligible`);
    } else {
      listingsToSend = allListings;
    }

    let categories: CategoryGroup[] = [];
    let filterLinks: FilterLinkWithCount[] = [];

    if (template.template_type === "recent_by_category") {
      categories = categorizeByBedrooms(listingsToSend, template.category_limits);
      console.log(`📊 Categorized into ${categories.length} bedroom groups`);
    } else if (template.template_type === "filter_links") {
      const { data: presets } = await supabaseAdmin
        .from("filter_presets")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

      for (const preset of (presets || []) as FilterPreset[]) {
        const count = await getListingCount(supabaseAdmin, preset.filter_params);
        const url = buildFilterUrl(preset.filter_params);

        filterLinks.push({
          preset_id: preset.id,
          label: preset.display_label,
          count,
          url,
          short_url: preset.short_code ? `${siteUrl}/l/${preset.short_code}` : undefined,
        });
      }

      console.log(`🔗 Generated ${filterLinks.length} filter links`);
    } else if (template.template_type === "mixed_layout") {
      categories = categorizeByBedrooms(listingsToSend, template.category_limits);

      if (template.include_filter_links && template.filter_preset_ids.length > 0) {
        const { data: presets } = await supabaseAdmin
          .from("filter_presets")
          .select("*")
          .in("id", template.filter_preset_ids);

        const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

        for (const preset of (presets || []) as FilterPreset[]) {
          const count = await getListingCount(supabaseAdmin, preset.filter_params);
          const url = buildFilterUrl(preset.filter_params);

          filterLinks.push({
            preset_id: preset.id,
            label: preset.display_label,
            count,
            url,
            short_url: preset.short_code ? `${siteUrl}/l/${preset.short_code}` : undefined,
          });
        }
      }
    } else {
      categories = [{ label: "New Listings", key: "all", listings: listingsToSend }];
    }

    const totalListings = categories.reduce((sum, cat) => sum + cat.listings.length, 0);

    if (dry_run) {
      const listingsByCategory: Record<string, number> = {};
      for (const cat of categories) {
        listingsByCategory[cat.key] = cat.listings.length;
      }

      console.log("🔍 Dry run mode: returning preview data");

      const response: DigestResponse = {
        success: true,
        dry_run: true,
        listingCount: totalListings,
        adminCount: adminEmails.length,
        template_name: template.name,
        template_type: template.template_type,
        listings_by_category: listingsByCategory,
        filter_links: filterLinks,
        message: "Preview: This digest would send to the specified recipients",
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

    const { count: totalActive } = await supabaseAdmin
      .from("listings")
      .select("*", { count: 'exact', head: true })
      .eq("approved", true)
      .eq("is_active", true);

    const createShortUrl = async (listingId: string, originalUrl: string): Promise<string> => {
      try {
        const { data: shortCode } = await supabaseAdmin.rpc(
          "create_short_url",
          {
            p_listing_id: listingId,
            p_original_url: originalUrl,
            p_source: "digest_email",
            p_expires_days: 90
          }
        );

        if (shortCode) {
          return `${siteUrl}/l/${shortCode}`;
        }
      } catch (error) {
        console.error("Error creating short URL:", error);
      }
      return originalUrl;
    };

    const emailContent = await renderPlainTextEmail(
      categories,
      filterLinks,
      siteUrl,
      totalActive || 0,
      createShortUrl
    );

    const subject = generateEmailSubject(
      template.name,
      template.subject_template,
      totalListings
    );

    console.log(`📤 Sending email to ${adminEmails.length} admin(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject,
      html: emailContent,
      fromName: "HaDirot Admin",
    });

    console.log("✅ Email sent successfully");

    const digestSendRecord = {
      template_id: template_id || null,
      template_name: template.name,
      template_type: template.template_type,
      sent_by: user.id,
      recipient_emails: adminEmails,
      recipient_count: adminEmails.length,
      total_listings_sent: totalListings,
      listings_by_category: categories.reduce((obj, cat) => {
        obj[cat.key] = cat.listings.length;
        return obj;
      }, {} as Record<string, number>),
      filter_links_included: filterLinks,
      execution_time_ms: Date.now() - startTime,
      success: true,
      config_snapshot: template,
    };

    const { data: digestSend, error: sendError } = await supabaseAdmin
      .from("digest_sends")
      .insert(digestSendRecord)
      .select()
      .single();

    if (sendError) {
      console.error("⚠️ Failed to log digest send:", sendError);
    }

    if (digestSend && totalListings > 0) {
      const sentListingRecords = [];
      for (const category of categories) {
        for (const listing of category.listings) {
          sentListingRecords.push({
            digest_send_id: digestSend.id,
            listing_id: listing.id,
            template_id: template_id || null,
            category_label: category.key,
            listing_price: listing.price,
            listing_bedrooms: listing.bedrooms,
          });
        }
      }

      const { error: listingsError } = await supabaseAdmin
        .from("digest_sent_listings")
        .insert(sentListingRecords);

      if (listingsError) {
        console.error("⚠️ Failed to record sent listings:", listingsError);
      } else {
        console.log(`✅ Recorded ${sentListingRecords.length} sent listing(s)`);
      }
    }

    if (template_id) {
      await supabaseAdmin
        .from("digest_templates")
        .update({
          usage_count: (template.usage_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", template_id);
    }

    const response: DigestResponse = {
      success: true,
      listingCount: totalListings,
      adminCount: adminEmails.length,
      template_name: template.name,
      template_type: template.template_type,
      digest_send_id: digestSend?.id,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Error in digest job:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});