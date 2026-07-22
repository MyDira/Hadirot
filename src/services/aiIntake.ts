import {
  supabase,
  ScrapedListing,
  ScrapeRun,
  IntakeImage,
  CallStatus,
  Profile,
} from '@/config/supabase';
import { getAdminActiveDays, getExpirationDate } from './listings';
import { resizeImageForUpload } from '../utils/imageResize';
import { generateVideoThumbnail } from '../utils/videoUtils';
import { emailService, renderBrandEmail } from './email';
import { paymentsService } from './payments';
import { scoreMatch, type LiveListingCandidate, type MatchCandidate } from '../utils/intakeMatch';

export type IntakeReviewStatus = 'pending' | 'published' | 'discarded' | 'all';

// ---------------------------------------------------------------------------
// Unified review filters + call workflow (all intake sources)
// ---------------------------------------------------------------------------
export interface ReviewFilters {
  source: string; // 'all' | one of the IntakeSource values
  kind: 'all' | 'rental' | 'sale';
  callStatus: 'active' | 'all' | CallStatus; // 'active' = everything not published/discarded
  neighborhood: string; // 'all' or a neighborhood name
  newOnly: boolean; // admin_reviewed_at IS NULL
}

/** Optimized call workflow — labels + allowed transitions for each status. */
export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  pending_call: 'New — to call',
  called_no_answer: 'No answer',
  called_declined: 'Declined',
  approved: 'Permission — ready',
  published: 'Published',
  suppressed: 'Discarded',
};

const CALL_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  pending_call: ['called_no_answer', 'called_declined', 'approved', 'suppressed'],
  called_no_answer: ['called_declined', 'approved', 'suppressed'],
  called_declined: ['pending_call', 'suppressed'],
  approved: ['published', 'suppressed', 'pending_call'],
  published: [],
  suppressed: ['pending_call'],
};

export function getCallTransitions(current: CallStatus): CallStatus[] {
  return CALL_TRANSITIONS[current] ?? [];
}

export interface PamphletFileRef {
  path: string;
  mime: string;
  name: string;
}

export interface PamphletParseResult {
  run_id: string;
  source: string;
  parsed: number;
  inserted: number;
  updated: number;
  geocoded: number;
  errors: Array<{ unit: number; error: string }>;
}

export interface ScrapeResult {
  run_id: string;
  pages_fetched: number;
  parsed: number;
  inserted: number;
  updated: number;
  geocoded: number;
  errors: Array<{ slug: string; error: string }>;
}

export interface IntakeBlockInput {
  text: string;
  type_hint: 'auto' | 'rental' | 'sale';
  assigned_user_id: string | null;
  admin_custom_agency_name: string | null;
  admin_listing_type_display: 'agent' | 'owner' | null;
  image_paths: IntakeImage[];
}

export interface ParseBlocksResult {
  run_id: string;
  parsed: number;
  inserted: number;
  updated?: number;
  geocoded: number;
  errors: Array<{ block: number; error: string }>;
}

export interface PublishResult {
  succeeded: Array<{ scrapedId: string; listingId: string }>;
  failed: Array<{ scrapedId: string; title: string; error: string }>;
}

const REVIEW_STATUS_TO_CALL_STATUS: Record<Exclude<IntakeReviewStatus, 'all'>, CallStatus> = {
  pending: 'approved',
  published: 'published',
  discarded: 'suppressed',
};

export function toE164(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export const aiIntakeService = {
  // -------------------------------------------------------------------------
  // Input stage
  // -------------------------------------------------------------------------

  async uploadIntakeImage(file: File, adminId: string): Promise<IntakeImage> {
    const resized = await resizeImageForUpload(file);
    const fileExt = resized.name.split('.').pop();
    const fileName = `user_${adminId}/intake/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { error } = await supabase.storage.from('listing-images').upload(fileName, resized);
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from('listing-images').getPublicUrl(fileName);

    return { filePath: fileName, publicUrl, is_featured: false, type: 'image' };
  },

  async uploadIntakeVideo(file: File, adminId: string): Promise<IntakeImage> {
    const fileExt = file.name.split('.').pop() || 'mp4';
    const base = `user_${adminId}/intake/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${base}.${fileExt}`;

    const { error } = await supabase.storage.from('listing-videos').upload(fileName, file);
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from('listing-videos').getPublicUrl(fileName);

    let thumbnailPath: string | undefined;
    let thumbnailUrl: string | undefined;
    try {
      const thumbBlob = await generateVideoThumbnail(file);
      const thumbFile = new File([thumbBlob], `${base}_thumb.jpg`, { type: 'image/jpeg' });
      const resizedThumb = await resizeImageForUpload(thumbFile);
      const thumbExt = resizedThumb.name.split('.').pop() || 'jpg';
      const path = `${base}_thumb.${thumbExt}`;
      const { error: thumbError } = await supabase.storage
        .from('listing-images')
        .upload(path, resizedThumb);
      if (thumbError) throw thumbError;
      thumbnailPath = path;
      thumbnailUrl = supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
    } catch (err) {
      // Thumbnail is a nice-to-have — the video itself still uploaded fine.
      console.error('Video thumbnail generation failed:', err);
    }

    return { filePath: fileName, publicUrl, is_featured: false, type: 'video', thumbnailPath, thumbnailUrl };
  },

  async deleteIntakeMedia(item: IntakeImage): Promise<void> {
    // Best-effort: a leftover file in the intake folder is harmless.
    const bucket = item.type === 'video' ? 'listing-videos' : 'listing-images';
    await supabase.storage.from(bucket).remove([item.filePath]);
    if (item.thumbnailPath) {
      await supabase.storage.from('listing-images').remove([item.thumbnailPath]);
    }
  },

  async parseBlocks(blocks: IntakeBlockInput[]): Promise<ParseBlocksResult> {
    const { data, error } = await supabase.functions.invoke('parse-bulk-listings', {
      body: { blocks },
    });
    if (error) throw new Error(error.message || 'Failed to parse listings');
    if (data?.error) throw new Error(data.error);
    return data as ParseBlocksResult;
  },

  // -------------------------------------------------------------------------
  // Pamphlet upload → parse (Luach HaTsibbur / Kol Berama / Heimish booklet)
  // -------------------------------------------------------------------------

  /** Upload a source PDF/photo to storage; returns a ref the edge fn reads. */
  async uploadPamphletFile(file: File, adminId: string): Promise<PamphletFileRef> {
    const isImage = file.type.startsWith('image/');
    // Images: shrink for OCR-friendly size. PDFs: upload as-is.
    const toUpload = isImage ? await resizeImageForUpload(file) : file;
    const ext = (toUpload.name.split('.').pop() || (isImage ? 'jpg' : 'pdf')).toLowerCase();
    const path = `user_${adminId}/intake-sources/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('listing-images')
      .upload(path, toUpload, { contentType: file.type || undefined });
    if (error) throw error;

    return { path, mime: file.type || (isImage ? 'image/jpeg' : 'application/pdf'), name: file.name };
  },

  /**
   * Full pamphlet parse, client-driven: the edge function plans page chunks
   * (booklets run 50+ pages — one Claude call per ~5 pages), the client fires
   * the chunk calls with bounded concurrency and reports progress, then
   * finalizes the run. Individual chunk failures don't sink the run.
   */
  async parsePamphlet(
    args: {
      source: string;
      type_hint: 'auto' | 'rental' | 'sale';
      files: PamphletFileRef[];
    },
    onProgress?: (done: number, total: number) => void,
  ): Promise<PamphletParseResult> {
    const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
      const { data, error } = await supabase.functions.invoke('parse-pamphlet', { body });
      if (error) throw new Error(error.message || 'Pamphlet parsing failed');
      if (data?.error) throw new Error(data.error);
      return data as T;
    };

    // 1. Plan chunks + create the run.
    const start = await invoke<{ run_id: string; chunks: unknown[]; total_pages: number }>({
      action: 'start',
      source: args.source,
      files: args.files,
    });
    const chunks = start.chunks;
    onProgress?.(0, chunks.length);

    // 2. Parse chunks with bounded concurrency (Claude calls are slow + heavy).
    const totals = { parsed: 0, inserted: 0, updated: 0, geocoded: 0 };
    const errors: Array<{ unit: number; error: string }> = [];
    let done = 0;
    let cursor = 0;
    const CONCURRENCY = 2;

    const worker = async () => {
      while (cursor < chunks.length) {
        const index = cursor++;
        try {
          const res = await invoke<{
            parsed: number;
            inserted: number;
            updated: number;
            geocoded: number;
            errors: Array<{ error: string }>;
          }>({
            action: 'chunk',
            source: args.source,
            type_hint: args.type_hint,
            run_id: start.run_id,
            chunk: chunks[index],
          });
          totals.parsed += res.parsed;
          totals.inserted += res.inserted;
          totals.updated += res.updated;
          totals.geocoded += res.geocoded;
          for (const e of res.errors ?? []) errors.push({ unit: index, error: e.error });
        } catch (err) {
          errors.push({
            unit: index,
            error: err instanceof Error ? err.message : 'Chunk failed',
          });
        }
        done++;
        onProgress?.(done, chunks.length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()),
    );

    // 3. Stamp the run.
    await invoke({ action: 'finalize', run_id: start.run_id, totals, errors });

    return { run_id: start.run_id, source: args.source, ...totals, errors };
  },

  // -------------------------------------------------------------------------
  // Website scrape (luach.com)
  // -------------------------------------------------------------------------

  async scrapeLuachCom(args: { pages: number; limit: number }): Promise<ScrapeResult> {
    const { data, error } = await supabase.functions.invoke('scrape-luach-com', { body: args });
    if (error) throw new Error(error.message || 'Failed to scrape luach.com');
    if (data?.error) throw new Error(data.error);
    return data as ScrapeResult;
  },

  // -------------------------------------------------------------------------
  // Unified review (all sources) — filterable table + call workflow
  // -------------------------------------------------------------------------

  async getRuns(limit = 40): Promise<ScrapeRun[]> {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async getReviewListings(filters: ReviewFilters): Promise<ScrapedListing[]> {
    let query = supabase.from('scraped_listings').select('*');

    if (filters.source !== 'all') query = query.eq('source', filters.source);
    if (filters.kind !== 'all') query = query.eq('listing_kind', filters.kind);
    if (filters.neighborhood !== 'all') query = query.eq('neighborhood', filters.neighborhood);
    if (filters.newOnly) query = query.is('admin_reviewed_at', null);

    if (filters.callStatus === 'active') {
      query = query.not('call_status', 'in', '(published,suppressed)');
    } else if (filters.callStatus !== 'all') {
      query = query.eq('call_status', filters.callStatus);
    }

    // New leads first, then most-recently-seen.
    const { data, error } = await query
      .order('admin_reviewed_at', { ascending: true, nullsFirst: true })
      .order('date_last_seen', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  },

  /** Distinct neighborhoods present in the pipeline, for the filter dropdown. */
  async getNeighborhoods(): Promise<string[]> {
    const { data, error } = await supabase
      .from('scraped_listings')
      .select('neighborhood')
      .not('neighborhood', 'is', null)
      .limit(2000);
    if (error) throw error;
    const set = new Set<string>();
    for (const r of data ?? []) if (r.neighborhood) set.add(r.neighborhood);
    return [...set].sort();
  },

  /** Move a lead through the call workflow; acknowledging clears the New flag. */
  async setCallStatus(id: string, status: CallStatus, notes?: string): Promise<void> {
    const patch: Record<string, unknown> = {
      call_status: status,
      admin_reviewed_at: new Date().toISOString(),
    };
    if (notes !== undefined) patch.call_notes = notes;
    const { error } = await supabase.from('scraped_listings').update(patch).eq('id', id);
    if (error) throw error;
  },

  async setCallStatusBulk(ids: string[], status: CallStatus): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('scraped_listings')
      .update({ call_status: status, admin_reviewed_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  },

  /** Acknowledge rows as seen (drops them from "New only") without changing status. */
  async markReviewed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('scraped_listings')
      .update({ admin_reviewed_at: new Date().toISOString() })
      .in('id', ids)
      .is('admin_reviewed_at', null);
    if (error) throw error;
  },

  async countNew(): Promise<number> {
    const { count, error } = await supabase
      .from('scraped_listings')
      .select('id', { count: 'exact', head: true })
      .is('admin_reviewed_at', null)
      .not('call_status', 'in', '(published,suppressed)');
    if (error) throw error;
    return count ?? 0;
  },

  // -------------------------------------------------------------------------
  // Review stage
  // -------------------------------------------------------------------------

  async getIntakeBatches(limit = 25): Promise<ScrapeRun[]> {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .eq('source', 'admin_intake')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async getIntakeListings(
    batchId: string | 'all',
    status: IntakeReviewStatus,
  ): Promise<ScrapedListing[]> {
    let query = supabase
      .from('scraped_listings')
      .select('*')
      .eq('source', 'admin_intake')
      .order('created_at', { ascending: false })
      .order('intake_block_index', { ascending: true });

    if (batchId !== 'all') query = query.eq('intake_batch_id', batchId);
    if (status !== 'all') query = query.eq('call_status', REVIEW_STATUS_TO_CALL_STATUS[status]);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async updateIntakeListing(id: string, patch: Partial<ScrapedListing>): Promise<void> {
    const { error } = await supabase.from('scraped_listings').update(patch).eq('id', id);
    if (error) throw error;
  },

  async discardIntakeListings(ids: string[]): Promise<void> {
    const { error } = await supabase
      .from('scraped_listings')
      .update({ call_status: 'suppressed' as CallStatus })
      .in('id', ids);
    if (error) throw error;
  },

  async restoreIntakeListing(id: string): Promise<void> {
    const { error } = await supabase
      .from('scraped_listings')
      .update({ call_status: 'approved' as CallStatus })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Permanently removes an intake row and its uploaded media (photos/video +
   * thumbnail). Unlike discard (call_status = 'suppressed'), this cannot be
   * undone — callers must confirm with the admin first. Never call this on a
   * published row (published_listing_id set); it would orphan the live
   * listing's provenance without touching the listing itself.
   */
  async deleteIntakeListing(scraped: ScrapedListing): Promise<void> {
    const media = Array.isArray(scraped.image_paths) ? scraped.image_paths : [];
    await Promise.all(media.map((item) => this.deleteIntakeMedia(item)));

    const { error } = await supabase.from('scraped_listings').delete().eq('id', scraped.id);
    if (error) throw error;
  },

  // -------------------------------------------------------------------------
  // Live-duplicate detection — advisory match against already-published
  // listings, computed at review time (a draft can be created before its
  // real-world twin goes live, so ingest-time dedup can't catch this; only
  // the intra-staging dedup_key in _shared/intake.ts runs at ingest).
  // -------------------------------------------------------------------------

  /** Minimal snapshot of every active listing, for client-side match scoring. */
  async buildLiveMatchIndex(): Promise<LiveListingCandidate[]> {
    const { data, error } = await supabase
      .from('listings')
      .select(
        `id, listing_type, bedrooms, contact_name, contact_phone, cross_street_a, cross_street_b,
         property_type, price, asking_price, call_for_price, admin_custom_agency_name,
         owner:profiles!listings_user_id_fkey(full_name)`,
      )
      .eq('is_active', true)
      .limit(3000);
    if (error) throw error;

    // An admin-posted listing displays under a custom agency name; everything
    // else sits under the owning account.
    return ((data ?? []) as unknown as Array<
      Omit<LiveListingCandidate, 'account_name'> & {
        admin_custom_agency_name: string | null;
        owner: { full_name: string | null } | null;
      }
    >).map(({ admin_custom_agency_name, owner, ...rest }) => ({
      ...rest,
      account_name: admin_custom_agency_name || owner?.full_name || null,
    }));
  },

  /** Scores one intake draft against the live index; strong matches first. */
  findLiveDuplicates(scraped: ScrapedListing, index: LiveListingCandidate[]): MatchCandidate[] {
    return index
      .map((live) => scoreMatch(scraped, live))
      .filter((m): m is MatchCandidate => m !== null)
      .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1));
  },

  async assignIntakeListings(ids: string[], assignedUserId: string | null): Promise<void> {
    const patch: Record<string, unknown> = { assigned_user_id: assignedUserId };
    if (assignedUserId) {
      // Assigned listings display under the user's own profile.
      patch.admin_custom_agency_name = null;
      patch.admin_listing_type_display = null;
    }
    const { error } = await supabase.from('scraped_listings').update(patch).in('id', ids);
    if (error) throw error;
  },

  async getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('id', unique);
    if (error) throw error;
    return new Map((data ?? []).map((p: Profile) => [p.id, p]));
  },

  async getMonetizationEnabled(): Promise<boolean> {
    const { data } = await supabase
      .from('admin_settings')
      .select('monetization_enabled')
      .maybeSingle();
    return data?.monetization_enabled === true;
  },

  /**
   * Trial-eligibility flags for the review screen. Intake publishes always
   * grant the trial (matching the form's admin behavior) — this is the
   * "heads up, this phone already used its trial" notice only.
   */
  async checkTrialEligibility(phones: Array<string | null>): Promise<Map<string, boolean>> {
    const unique = [...new Set(phones.map(toE164).filter((p): p is string => !!p))];
    const result = new Map<string, boolean>();
    await Promise.all(
      unique.map(async (phone) => {
        try {
          result.set(phone, await paymentsService.isPhoneTrialEligible(phone));
        } catch {
          // Eligibility is advisory — default to "eligible" on errors.
          result.set(phone, true);
        }
      }),
    );
    return result;
  },

  // -------------------------------------------------------------------------
  // Publish stage
  // -------------------------------------------------------------------------

  /**
   * Publishes one intake row straight into `listings`: approved, active, and
   * live immediately — with the same monetization treatment an admin gets in
   * the posting form (rentals start the 14-day trial at publish time).
   */
  async publishIntakeListing(
    scraped: ScrapedListing,
    adminUserId: string,
    opts: { rentalDays: number; saleDays: number; monetizationEnabled: boolean },
  ): Promise<string> {
    const extra = scraped.intake_extra || {};
    const isSale = scraped.listing_kind === 'sale';

    const title = (scraped.title || '').trim();
    if (!title) throw new Error('Title is required');
    if (scraped.bedrooms == null) throw new Error('Bedrooms is required');
    if (!scraped.bathrooms || scraped.bathrooms <= 0) throw new Error('Bathrooms is required');
    if (!(scraped.contact_name || scraped.agency_name)) throw new Error('Contact name is required');
    if (!(scraped.contact_phone_display || scraped.contact_phone)) {
      throw new Error('Contact phone is required');
    }

    const crossStreets = [scraped.cross_street_1, scraped.cross_street_2]
      .filter(Boolean)
      .join(' & ');
    const location = crossStreets || scraped.neighborhood || 'Unknown';

    const callForPrice =
      !!extra.call_for_price ||
      (isSale ? extra.asking_price == null : scraped.price == null);

    const propertyType = extra.property_type || 'apartment_building';
    const expiresAt = getExpirationDate(
      scraped.listing_kind,
      isSale ? 'available' : undefined,
      isSale ? opts.saleDays : opts.rentalDays,
    );
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      user_id: scraped.assigned_user_id || adminUserId,
      listing_type: scraped.listing_kind,
      title,
      description: scraped.description || null,
      location,
      neighborhood: scraped.neighborhood || 'Boro Park',
      cross_street_a: scraped.cross_street_1 || null,
      cross_street_b: scraped.cross_street_2 || null,
      bedrooms: scraped.bedrooms,
      bathrooms: scraped.bathrooms,
      price: isSale ? null : callForPrice ? null : scraped.price,
      asking_price: isSale ? (callForPrice ? null : extra.asking_price ?? null) : null,
      call_for_price: callForPrice,
      sale_status: isSale ? 'available' : null,
      floor: scraped.floor,
      square_footage: scraped.square_footage,
      property_type: propertyType,
      parking: extra.parking || (scraped.parking ? 'yes' : 'no'),
      heat: extra.heat || (scraped.heat_included ? 'included' : 'tenant_pays'),
      washer_dryer_hookup: extra.washer_dryer_hookup ?? scraped.washer_dryer ?? false,
      lease_length: isSale ? null : extra.lease_length ?? null,
      broker_fee: extra.broker_fee ?? false,
      multi_family: isSale
        ? ['two_family', 'three_family', 'four_family'].includes(propertyType)
        : null,
      contact_name: (scraped.contact_name || scraped.agency_name || '').trim(),
      contact_phone: (scraped.contact_phone_display || scraped.contact_phone || '').trim(),
      latitude: scraped.latitude,
      longitude: scraped.longitude,
      admin_custom_agency_name: scraped.assigned_user_id
        ? null
        : scraped.admin_custom_agency_name?.trim() || null,
      admin_listing_type_display: scraped.assigned_user_id
        ? null
        : scraped.admin_listing_type_display || null,
      // Admin intake publishes live immediately — no approval queue.
      approved: true,
      is_active: true,
      is_featured: false,
      expires_at: expiresAt.toISOString(),
      last_published_at: now,
      // Same monetization treatment as an admin posting through the form
      // (PostListingWizard: admin choice → individual_trial). The trial clock
      // normally starts at approval; publish IS approval here, so stamp it.
      ...(!isSale && opts.monetizationEnabled
        ? { payment_kind: 'individual_trial', trial_started_at: now }
        : {}),
    };

    const { data: listing, error: insertError } = await supabase
      .from('listings')
      .insert(payload)
      .select('id')
      .single();
    if (insertError) throw insertError;

    // --- Photos: copy block images into the listing's own storage folder ----
    const allMedia = Array.isArray(scraped.image_paths) ? scraped.image_paths : [];
    const images = allMedia.filter((img) => img.type !== 'video');
    const video = allMedia.find((img) => img.type === 'video');

    if (images.length > 0) {
      const hasFeatured = images.some((img) => img.is_featured);
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        let imageUrl = img.publicUrl;
        try {
          const ext = img.filePath.split('.').pop() || 'jpg';
          const destPath = `${listing.id}/${Date.now()}_${i}.${ext}`;
          const { error: copyError } = await supabase.storage
            .from('listing-images')
            .copy(img.filePath, destPath);
          if (!copyError) {
            imageUrl = supabase.storage.from('listing-images').getPublicUrl(destPath).data.publicUrl;
          }
        } catch {
          // Fall back to the shared intake URL — the image still renders.
        }
        const { error: imgError } = await supabase.from('listing_images').insert({
          listing_id: listing.id,
          image_url: imageUrl,
          is_featured: hasFeatured ? img.is_featured : i === 0,
          sort_order: i,
        });
        if (imgError) console.error('Failed to attach image:', imgError);
      }
    }

    // --- Video: copy into the listing's own storage folder + stamp the row --
    if (video) {
      try {
        const ext = video.filePath.split('.').pop() || 'mp4';
        const destPath = `${listing.id}/video_${Date.now()}.${ext}`;
        const { error: copyError } = await supabase.storage
          .from('listing-videos')
          .copy(video.filePath, destPath);
        const videoUrl = copyError
          ? video.publicUrl
          : supabase.storage.from('listing-videos').getPublicUrl(destPath).data.publicUrl;

        let videoThumbnailUrl: string | null = video.thumbnailUrl ?? null;
        if (video.thumbnailPath) {
          const thumbExt = video.thumbnailPath.split('.').pop() || 'jpg';
          const thumbDest = `${listing.id}/video_thumb_${Date.now()}.${thumbExt}`;
          const { error: thumbCopyError } = await supabase.storage
            .from('listing-images')
            .copy(video.thumbnailPath, thumbDest);
          if (!thumbCopyError) {
            videoThumbnailUrl = supabase.storage
              .from('listing-images')
              .getPublicUrl(thumbDest).data.publicUrl;
          }
        }

        const { error: videoUpdateError } = await supabase
          .from('listings')
          .update({ video_url: videoUrl, video_thumbnail_url: videoThumbnailUrl })
          .eq('id', listing.id);
        if (videoUpdateError) console.error('Failed to attach video:', videoUpdateError);
      } catch (err) {
        console.error('Failed to attach video:', err);
      }
    }

    const { error: updateError } = await supabase
      .from('scraped_listings')
      .update({
        call_status: 'published' as CallStatus,
        published_listing_id: listing.id,
      })
      .eq('id', scraped.id);
    if (updateError) throw updateError;

    return listing.id;
  },

  /**
   * Bulk publish with per-row error collection, then one summary email per
   * assigned user covering everything published to their account in this run.
   */
  async publishIntakeListings(
    rows: ScrapedListing[],
    adminUserId: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PublishResult> {
    const [{ rentalDays, saleDays }, monetizationEnabled] = await Promise.all([
      getAdminActiveDays(),
      this.getMonetizationEnabled(),
    ]);

    const result: PublishResult = { succeeded: [], failed: [] };
    const byAssignedUser = new Map<string, Array<{ listingId: string; title: string }>>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const listingId = await this.publishIntakeListing(row, adminUserId, {
          rentalDays,
          saleDays,
          monetizationEnabled,
        });
        result.succeeded.push({ scrapedId: row.id, listingId });
        if (row.assigned_user_id) {
          const list = byAssignedUser.get(row.assigned_user_id) ?? [];
          list.push({ listingId, title: row.title || 'Untitled' });
          byAssignedUser.set(row.assigned_user_id, list);
        }
      } catch (err) {
        result.failed.push({
          scrapedId: row.id,
          title: row.title || 'Untitled',
          error: err instanceof Error ? err.message : 'Publish failed',
        });
      }
      onProgress?.(i + 1, rows.length);
    }

    // --- Assignment summary emails (one per user, never blocking) -----------
    for (const [userId, published] of byAssignedUser) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', userId)
          .maybeSingle();
        if (!profile?.email) continue;

        const siteUrl = window.location.origin;
        const itemsHtml = published
          .map(
            (p) =>
              `<li style="margin-bottom:8px;"><a href="${siteUrl}/listing/${p.listingId}">${p.title}</a></li>`,
          )
          .join('');
        const html = renderBrandEmail({
          title:
            published.length === 1
              ? 'New Listing Assigned to You'
              : `${published.length} New Listings Assigned to You`,
          intro: `An administrator has published ${published.length === 1 ? 'a listing' : `${published.length} listings`} to your account. ${published.length === 1 ? 'It is' : 'They are'} live now — you can view and manage ${published.length === 1 ? 'it' : 'them'} from your dashboard.`,
          bodyHtml: `<ul style="padding-left:20px;">${itemsHtml}</ul>`,
          ctaLabel: 'View My Dashboard',
          ctaHref: `${siteUrl}/dashboard`,
        });
        await emailService.sendEmail({
          to: profile.email,
          subject:
            published.length === 1
              ? `Listing Assigned: ${published[0].title} - HaDirot`
              : `${published.length} Listings Assigned to You - HaDirot`,
          html,
        });
      } catch (emailError) {
        console.error('Failed to send assignment email:', emailError);
      }
    }

    return result;
  },
};
