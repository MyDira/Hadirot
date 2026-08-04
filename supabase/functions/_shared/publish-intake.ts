// Server-side publish of a scraped_listings row into listings — a Deno port of
// aiIntakeService.publishIntakeListing (src/services/aiIntake.ts). The client
// path keeps running in the browser for admin-clicked publishes; this port
// exists so the SMS outreach webhook can publish on a landlord's YES reply
// with no browser in the loop. Keep the two in sync when the publish payload
// changes.

// deno-lint-ignore-file no-explicit-any

interface IntakeImageRef {
  filePath: string;
  publicUrl: string;
  is_featured: boolean;
  type?: 'image' | 'video';
  thumbnailPath?: string;
  thumbnailUrl?: string;
}

export interface ScrapedRow {
  id: string;
  title: string | null;
  listing_kind: 'rental' | 'sale';
  description: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  floor: number | null;
  square_footage: number | null;
  parking: boolean | null;
  heat_included: boolean | null;
  washer_dryer: boolean | null;
  contact_name: string | null;
  agency_name: string | null;
  contact_phone: string | null;
  contact_phone_display: string | null;
  cross_street_1: string | null;
  cross_street_2: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  image_paths: IntakeImageRef[] | null;
  intake_extra: Record<string, any> | null;
  admin_custom_agency_name: string | null;
  admin_listing_type_display: string | null;
  call_status: string;
  published_listing_id: string | null;
}

const DEFAULT_ACTIVE_DAYS = 30;

/**
 * Publishes one intake row live under `ownerUserId`. Mirrors the client's
 * validation + payload exactly (approved + active immediately; rentals get the
 * 14-day trial stamped when monetization is on). Returns the new listing id.
 * Throws with a human-readable message on validation or insert failure.
 */
export async function publishScrapedListing(
  supabaseAdmin: any,
  scraped: ScrapedRow,
  ownerUserId: string,
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

  // Admin-configured active days + monetization switch (same sources as the
  // client's getAdminActiveDays / getMonetizationEnabled).
  const { data: settings } = await supabaseAdmin
    .from('admin_settings')
    .select('rental_active_days, sale_active_days, monetization_enabled')
    .maybeSingle();
  const activeDays = isSale
    ? settings?.sale_active_days ?? DEFAULT_ACTIVE_DAYS
    : settings?.rental_active_days ?? DEFAULT_ACTIVE_DAYS;
  const monetizationEnabled = settings?.monetization_enabled === true;

  const crossStreets = [scraped.cross_street_1, scraped.cross_street_2]
    .filter(Boolean)
    .join(' & ');
  const location = crossStreets || scraped.neighborhood || 'Unknown';

  const callForPrice =
    !!extra.call_for_price ||
    (isSale ? extra.asking_price == null : scraped.price == null);

  const propertyType = extra.property_type || 'apartment_building';
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + activeDays);
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    user_id: ownerUserId,
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
    admin_custom_agency_name: scraped.admin_custom_agency_name?.trim() || null,
    admin_listing_type_display: scraped.admin_listing_type_display || null,
    // Outreach publishes live immediately — the landlord just said YES.
    approved: true,
    is_active: true,
    is_featured: false,
    expires_at: expiresAt.toISOString(),
    last_published_at: now,
    // Same monetization treatment as an admin publish from the intake hub:
    // rentals start the 14-day free trial at publish time.
    ...(!isSale && monetizationEnabled
      ? { payment_kind: 'individual_trial', trial_started_at: now }
      : {}),
  };

  const { data: listing, error: insertError } = await supabaseAdmin
    .from('listings')
    .insert(payload)
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message || 'Listing insert failed');

  // --- Photos: copy intake images into the listing's own storage folder -----
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
        const { error: copyError } = await supabaseAdmin.storage
          .from('listing-images')
          .copy(img.filePath, destPath);
        if (!copyError) {
          imageUrl = supabaseAdmin.storage
            .from('listing-images')
            .getPublicUrl(destPath).data.publicUrl;
        }
      } catch {
        // Fall back to the shared intake URL — the image still renders.
      }
      const { error: imgError } = await supabaseAdmin.from('listing_images').insert({
        listing_id: listing.id,
        image_url: imageUrl,
        is_featured: hasFeatured ? img.is_featured : i === 0,
        sort_order: i,
      });
      if (imgError) console.error('Failed to attach image:', imgError);
    }
  }

  // --- Video: copy into the listing's own storage folder + stamp the row ----
  if (video) {
    try {
      const ext = video.filePath.split('.').pop() || 'mp4';
      const destPath = `${listing.id}/video_${Date.now()}.${ext}`;
      const { error: copyError } = await supabaseAdmin.storage
        .from('listing-videos')
        .copy(video.filePath, destPath);
      const videoUrl = copyError
        ? video.publicUrl
        : supabaseAdmin.storage.from('listing-videos').getPublicUrl(destPath).data.publicUrl;

      let videoThumbnailUrl: string | null = video.thumbnailUrl ?? null;
      if (video.thumbnailPath) {
        const thumbExt = video.thumbnailPath.split('.').pop() || 'jpg';
        const thumbDest = `${listing.id}/video_thumb_${Date.now()}.${thumbExt}`;
        const { error: thumbCopyError } = await supabaseAdmin.storage
          .from('listing-images')
          .copy(video.thumbnailPath, thumbDest);
        if (!thumbCopyError) {
          videoThumbnailUrl = supabaseAdmin.storage
            .from('listing-images')
            .getPublicUrl(thumbDest).data.publicUrl;
        }
      }

      const { error: videoUpdateError } = await supabaseAdmin
        .from('listings')
        .update({ video_url: videoUrl, video_thumbnail_url: videoThumbnailUrl })
        .eq('id', listing.id);
      if (videoUpdateError) console.error('Failed to attach video:', videoUpdateError);
    } catch (err) {
      console.error('Failed to attach video:', err);
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('scraped_listings')
    .update({
      call_status: 'published',
      published_listing_id: listing.id,
    })
    .eq('id', scraped.id);
  if (updateError) {
    // The listing IS live — surface the bookkeeping failure but don't undo.
    console.error('Failed to mark scraped row published:', updateError);
  }

  return listing.id;
}

/**
 * Resolves the house account every outreach publish posts to. Configurable via
 * the HOUSE_ACCOUNT_EMAIL secret; defaults to l@hadirot.com.
 */
export async function resolveHouseAccountId(supabaseAdmin: any): Promise<string | null> {
  const email = Deno.env.get('HOUSE_ACCOUNT_EMAIL') || 'l@hadirot.com';
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
