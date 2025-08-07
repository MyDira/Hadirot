import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    const newImageRecords = [];
    const errors = [];

    for (let i = 0; i < tempImages.length; i++) {
      const tempImage = tempImages[i];
      const { filePath, is_featured, originalName } = tempImage;
      
      if (!filePath) {
        errors.push(`Image ${i + 1}: Missing filePath`);
        continue;
      }

      try {
        // Download the image from temp location
        const { data: imageData, error: downloadError } = await supabaseAdmin.storage
          .from('listing-images')
          .download(filePath);

        if (downloadError) {
          console.error(`Error downloading temp image ${filePath}:`, downloadError);
          errors.push(`Failed to download ${filePath}: ${downloadError.message}`);
          continue;
        }

        // Generate new filename for the final location
        const fileExt = originalName?.split('.').pop() || filePath.split('.').pop();
        const newFileName = `${listingId}/${Date.now()}_${i}.${fileExt}`;

        // Upload to final location in same bucket
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
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

        // Get public URL for the new image
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('listing-images')
          .getPublicUrl(newFileName);

        // Create image record
        newImageRecords.push({
          listing_id: listingId,
          image_url: publicUrl,
          is_featured: is_featured || false,
          sort_order: i,
        });

        // Delete the temporary image
        const { error: deleteTempError } = await supabaseAdmin.storage
          .from('listing-images')
          .remove([filePath]);

        if (deleteTempError) {
          console.error(`Error deleting temp image ${filePath}:`, deleteTempError);
          // Don't add to errors array as the main operation succeeded
        }

      } catch (imageError) {
        console.error(`Error processing image ${filePath}:`, imageError);
        errors.push(`Failed to process ${filePath}: ${imageError.message}`);
      }
    }

    // Insert new image records into listing_images table
    if (newImageRecords.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('listing_images')
        .insert(newImageRecords);

      if (insertError) {
        console.error('Error inserting new image records:', insertError);
        errors.push(`Failed to insert image records: ${insertError.message}`);
      }
    }

    // Clean up any remaining temp folder for this user
    try {
      const { data: tempFiles } = await supabaseAdmin.storage
        .from('listing-images')
        .list(`user_${userId}/temp`);

      if (tempFiles && tempFiles.length === 0) {
        // If temp folder is empty, we can remove it (optional cleanup)
        console.log(`✅ Temp folder for user ${userId} is now empty`);
      }
    } catch (cleanupError) {
      console.error('Error during temp folder cleanup:', cleanupError);
      // Don't add to errors as this is optional cleanup
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ 
        message: 'Completed with errors', 
        errors,
        successfulImages: newImageRecords.length 
      }), {
        status: 207, // Multi-status
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      message: 'Images finalized successfully', 
      imageCount: newImageRecords.length 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in move-temp-images:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});