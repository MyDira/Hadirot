/*
  # Create modal-attachments Storage Bucket

  ## Summary
  Storage bucket for files attached to admin-controlled modal popups. When an
  admin uploads a file in the modal editor, it lands here and the modal renders
  a "Download now" button that links to the public URL.

  ## Changes
  1. Storage Bucket
    - Create `modal-attachments` bucket (public read for download links).
    - ON CONFLICT DO NOTHING to be safe on re-run.

  2. Row Level Security Policies
    - Public can SELECT (so download links work for anonymous visitors).
    - Only admins can INSERT / UPDATE / DELETE.

  ## Notes
  - Object naming convention: `{modalId}/{timestamp}.{ext}`.
  - Cleanup on modal-delete is handled in application code (services/modals.ts).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('modal-attachments', 'modal-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view modal attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'modal-attachments');

CREATE POLICY "Admins can upload modal attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'modal-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can update modal attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'modal-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can delete modal attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'modal-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
