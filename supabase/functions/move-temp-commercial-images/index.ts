import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { validateFile } from '../_shared/validateFileUpload.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { listingId, userId, tempImages } = await req.json();

    if (!listingId || !userId || !tempImages || !Array.isArray(tempImages)) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: listingId, userId, and tempImages (array)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tempImages.length > 50) {
      return new Response(JSON.stringify({ error: 'Too many images (max 50)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(listingId)) {
      return new Response(JSON.stringify({ error: 'Invalid listingId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!UUID_RE.test(userId)) {
      return new Response(JSON.stringify({ error: 'Invalid userId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newImageRecords: {
      listing_id: string;
      image_url: string;
      is_featured: boolean;
      sort_order: number;
    }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < tempImages.length; i++) {
      const tempImage = tempImages[i];
      const { filePath, is_featured, originalName } = tempImage;

      if (!filePath) {
        errors.push(`Image ${i + 1}: Missing filePath`);
        continue;
      }

      try {
        const { data: imageData, error: downloadError } = await supabaseAdmin.storage
          .from('listing-images')
          .download(filePath);

        if (downloadError) {
          console.error(`Error downloading temp image ${filePath}:`, downloadError);
          errors.push(`Failed to download ${filePath}: ${downloadError.message}`);
          continue;
        }

        // Server-side validation: MIME type, extension, magic bytes, size
        const validation = await validateFile(imageData, originalName || filePath);
        if (!validation.valid) {
          console.error(`Validation failed for ${filePath}: ${validation.reason}`);
          errors.push(`Rejected ${filePath}: ${validation.reason}`);
          await supabaseAdmin.storage.from('listing-images').remove([filePath]);
          continue;
        }

        const fileExt = originalName?.split('.').pop() || filePath.split('.').pop();
        const newFileName = `commercial/${listingId}/${Date.now()}_${i}.${fileExt}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('listing-images')
          .upload(newFileName, imageData, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error(`Error uploading image to final location ${newFileName}:`, uploadError);
          errors.push(`Failed to upload ${newFileName}: ${uploadError.message}`);
          continue;
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('listing-images')
          .getPublicUrl(newFileName);

        newImageRecords.push({
          listing_id: listingId,
          image_url: publicUrl,
          is_featured: is_featured || false,
          sort_order: i,
        });

        const { error: deleteTempError } = await supabaseAdmin.storage
          .from('listing-images')
          .remove([filePath]);

        if (deleteTempError) {
          console.error(`Error deleting temp image ${filePath}:`, deleteTempError);
        }

      } catch (imageError) {
        console.error(`Error processing image ${filePath}:`, imageError);
        errors.push(`Failed to process ${filePath}: ${(imageError as Error).message}`);
      }
    }

    if (newImageRecords.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('commercial_listing_images')
        .insert(newImageRecords);

      if (insertError) {
        console.error('Error inserting new commercial image records:', insertError);
        errors.push(`Failed to insert image records: ${insertError.message}`);
      }
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({
        message: 'Completed with errors',
        errors,
        successfulImages: newImageRecords.length
      }), {
        status: 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      message: 'Commercial images finalized successfully',
      imageCount: newImageRecords.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in move-temp-commercial-images:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
