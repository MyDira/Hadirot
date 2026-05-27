/*
  # Make modal button fields optional and add attachment columns

  ## Summary
  Two related changes to `modal_popups`:
  1. Allow modals to be posted with no CTA button (drop NOT NULL on button_text/button_url).
  2. Allow modals to carry a downloadable file attachment stored in the
     `modal-attachments` storage bucket (created in the next migration).

  ## Changes
  - `button_text`: NOT NULL -> NULL
  - `button_url`:  NOT NULL -> NULL
  - Add `attachment_path` (text, nullable) — storage object key, e.g. `{modalId}/{timestamp}.{ext}`
  - Add `attachment_filename` (text, nullable) — original filename for display + download

  ## Notes
  - Existing rows already have non-null button fields; relaxing the constraint is forward-compatible.
  - Attachment columns are nullable so existing rows need no backfill.
  - Storage object lifecycle is managed in application code (uploaded on save,
    removed when admin clicks "Remove attachment" or deletes the modal).
*/

ALTER TABLE modal_popups
  ALTER COLUMN button_text DROP NOT NULL,
  ALTER COLUMN button_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_filename text;
