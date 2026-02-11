# Enhanced Admin Email Digest System - Implementation Guide

## Overview

The enhanced admin digest system has been designed and partially implemented to provide flexible, powerful email digest capabilities with multiple delivery modes, reusable templates, filter presets, and comprehensive tracking.

## What Has Been Completed

### 1. Database Schema ✅

**Migration File**: `supabase/migrations/20251117000000_create_enhanced_digest_system.sql`

**New Tables Created:**
- `digest_templates` - Stores reusable digest configurations
  - Template types: unsent_only, recent_by_category, filter_links, custom_query, mixed_layout, all_active
  - Filter configuration stored as JSONB
  - Category limits for controlling listing counts per group
  - Deduplication settings (allow_resend, resend_after_days, ignore_send_history)
  - Email customization (subject templates, filter preset links)

- `digest_sends` - Audit log of all digest executions
  - Template used, recipients, listing counts by category
  - Filter links included with counts
  - Execution time and success/failure tracking
  - Configuration snapshot for audit trail

- `digest_sent_listings` - Detailed tracking of sent listings
  - Links listing to digest send and template
  - Stores category label and listing details at time of send
  - Enables per-template deduplication

- `filter_presets` - Common filter combinations for browse links
  - Display labels like "2BR Under $3K"
  - Filter parameters stored as JSONB
  - Categories: by_bedrooms, by_price, popular
  - Optional short URL codes for tracking

**Default Data Inserted:**
- 3 default digest templates (Unsent Only, Recent by Bedrooms, Filter Links)
- 13 filter presets covering bedrooms, price ranges, and popular combinations

**Security:**
- RLS enabled on all tables
- Only admins can manage templates and presets
- Only admins can view digest history
- Service role can insert send records

### 2. Helper Modules Created 🔧

**Location**: `supabase/functions/send-daily-admin-digest/`

- `types.ts` - TypeScript type definitions for all data structures
- `query-builder.ts` - Functions for building Supabase queries based on filter config
- `categorizer.ts` - Logic for grouping listings by bedrooms or price tiers
- `email-templates.ts` - Functions for rendering plain text email content

### 3. Enhanced Edge Function 🚧 (Partially Complete)

**Location**: `supabase/functions/send-enhanced-digest/index.ts`

**Features Implemented:**
- Template loading (by ID, inline config, or default)
- Multiple digest types support
- Deduplication logic (unsent only, allow resend, ignore history)
- Category-based organization
- Filter link generation with live counts
- Dry run mode for previewing
- Comprehensive audit logging
- Short URL integration
- Error handling and admin authentication

**Status**: Code written but not deployed due to module import complexity

## What Needs To Be Completed

### 1. Consolidate Edge Function 📝

The edge function currently imports helper modules that need to be inline in a single file for Supabase deployment. Options:

**Option A**: Create a single consolidated file with all helper functions inline
- Combine types, query-builder, categorizer, and email-templates into index.ts
- This makes deployment straightforward
- File will be around 800-1000 lines but maintainable with good organization

**Option B**: Copy helper modules into the function directory
- Create `send-enhanced-digest/types.ts`, `send-enhanced-digest/query-builder.ts`, etc.
- Update import paths to be relative
- Deploy with all files included

### 2. Build Admin UI Components 🎨

**Location**: Update `src/pages/ContentManagement.tsx` or create new `src/pages/DigestManagement.tsx`

**Required Components:**

**A. Template Library View**
```typescript
- List all digest templates as cards
- Show template name, type, last used date, usage count
- Quick actions: Use, Edit, Duplicate, Delete
- Filter by template type
- Search by name
```

**B. Send Digest Interface**
```typescript
- Template selector dropdown
- Configuration panel (appears when template selected):
  - Date range selector
  - Category limits (listings per bedroom group)
  - Deduplication options (allow resend, ignore history)
  - Recipient selection (all admins or custom emails)
- Preview button (calls dry_run mode)
- Preview display showing counts and categories
- Send button with confirmation dialog
```

**C. Template Editor**
```typescript
- Template name and description
- Digest type selector (radio buttons)
- Filter configuration:
  - Bedrooms (multi-select)
  - Price range (min/max)
  - Locations (multi-select)
  - Property types (checkboxes)
  - Broker fee (yes/no/any)
  - Date range in days
- Category limits editor
- Sorting preference (dropdown)
- Deduplication settings
- Email subject template
- Filter preset selector (for mixed layout)
- Save and Test buttons
```

**D. Filter Preset Manager**
```typescript
- List all presets organized by category
- Create new preset form:
  - Name and display label
  - Category (dropdown)
  - Filter parameters (same as template filters)
  - Display order
- Test button (opens browse page with filters)
- Edit and Delete actions
- Usage statistics
```

**E. Digest History View**
```typescript
- Table of past digest sends
- Columns: Date, Template, Recipients, Listings Sent, Success
- Expandable rows showing:
  - Listings by category breakdown
  - Filter links included
  - Execution time
  - Error messages (if failed)
- Filters: Date range, Template, Success/Failed
- Export to CSV option
```

### 3. API Integration Functions 🔌

**Location**: `src/services/digest.ts` (new file)

```typescript
export const digestService = {
  // Templates
  getTemplates: async () => { /* ... */ },
  getTemplate: async (id: string) => { /* ... */ },
  createTemplate: async (template: Partial<DigestTemplate>) => { /* ... */ },
  updateTemplate: async (id: string, updates: Partial<DigestTemplate>) => { /* ... */ },
  deleteTemplate: async (id: string) => { /* ... */ },

  // Filter Presets
  getFilterPresets: async () => { /* ... */ },
  createFilterPreset: async (preset: Partial<FilterPreset>) => { /* ... */ },
  updateFilterPreset: async (id: string, updates: Partial<FilterPreset>) => { /* ... */ },
  deleteFilterPreset: async (id: string) => { /* ... */ },

  // Sending Digests
  sendDigest: async (params: {
    template_id?: string;
    template_config?: Partial<DigestTemplate>;
    dry_run?: boolean;
    recipient_emails?: string[];
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    return await supabase.functions.invoke('send-enhanced-digest', {
      body: params,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  },

  // History
  getDigestHistory: async (filters?: {
    startDate?: string;
    endDate?: string;
    templateId?: string;
  }) => { /* ... */ },

  getDigestSendDetails: async (sendId: string) => { /* ... */ },
};
```

### 4. Update Existing Send Digest Button 🔄

**Location**: `src/pages/ContentManagement.tsx` (around line 229-308)

Currently there's a "Send Test Digest" button that calls the old `send-daily-admin-digest` function. This should be updated to:
1. Open a modal/drawer with the new digest sender interface
2. Allow template selection
3. Show preview before sending
4. Call the new `send-enhanced-digest` function

### 5. Short URL Integration for Filter Presets 🔗

**Location**: Modify `filter_presets` table or add edge function

When a filter preset is created, optionally generate a short URL:
```typescript
// In preset creation/update:
if (preset.filter_params) {
  const fullUrl = buildFilterUrl(preset.filter_params);
  const shortCode = await supabase.rpc('create_short_url', {
    p_listing_id: null, // Not listing-specific
    p_original_url: fullUrl,
    p_source: 'filter_preset',
    p_expires_days: 365 // Long expiration for presets
  });

  // Store shortCode in filter_presets.short_code
}
```

### 6. Testing Checklist ✅

Once implementation is complete, test:

**Template Management:**
- [ ] Create new template
- [ ] Edit existing template
- [ ] Duplicate template
- [ ] Delete template
- [ ] Default templates load correctly

**Filter Presets:**
- [ ] Create preset
- [ ] Edit preset
- [ ] Test preset (opens browse page correctly)
- [ ] Delete preset
- [ ] Short URLs work for presets

**Sending Digests:**
- [ ] Send with default template
- [ ] Send with custom template
- [ ] Dry run preview shows correct counts
- [ ] Unsent only mode works (doesn't resend)
- [ ] Recent by category organizes correctly
- [ ] Filter links show accurate counts
- [ ] Mixed layout includes both listings and links
- [ ] Allow resend works with date threshold
- [ ] Ignore history sends all listings
- [ ] Short URLs created for listings
- [ ] Email arrives with correct formatting

**History and Audit:**
- [ ] Digest sends logged correctly
- [ ] Listing tracking records created
- [ ] Template usage count increments
- [ ] Filter preset usage tracked
- [ ] Error messages logged on failure

## Quick Start Commands

### Deploy Edge Function (Once Consolidated)

```bash
# Option 1: Using Supabase CLI (if available)
npx supabase functions deploy send-enhanced-digest

# Option 2: Using MCP tool from this interface
# Use mcp__supabase__deploy_edge_function with consolidated file
```

### Query Template

s

```typescript
// In admin UI
const templates = await supabase
  .from('digest_templates')
  .select('*')
  .order('last_used_at', { ascending: false, nullsFirst: false });
```

### Send Digest Example

```typescript
// From admin UI
const response = await supabase.functions.invoke('send-enhanced-digest', {
  body: {
    template_id: 'template-uuid-here',
    dry_run: false,
  },
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

## Architecture Decisions

1. **JSONB for Flexibility**: Filter configs and category limits use JSONB to allow flexible schema without migrations
2. **Per-Template Deduplication**: Separate tracking allows different templates to have different resend rules
3. **Audit Trail**: Complete snapshot of configuration at send time for historical analysis
4. **Short URLs**: Integration with existing system for click tracking and cleaner emails
5. **Dry Run Mode**: Preview capability to ensure confidence before sending
6. **Plain Text Emails**: Maintains existing approach for best deliverability and simplicity

## Next Steps

1. **Consolidate the edge function** into a single deployable file
2. **Deploy the edge function** to Supabase
3. **Build the admin UI components** for template and preset management
4. **Update the existing send digest interface** to use new system
5. **Test thoroughly** with real data
6. **Add documentation** for end users

## File Locations Summary

```
supabase/
  migrations/
    20251117000000_create_enhanced_digest_system.sql  ✅ Applied
  functions/
    send-daily-admin-digest/  📁 Helper modules (need consolidation)
      types.ts
      query-builder.ts
      categorizer.ts
      email-templates.ts
    send-enhanced-digest/  🚧 Main function (needs consolidation & deployment)
      index.ts

src/
  pages/
    ContentManagement.tsx  🔄 Needs digest UI addition
  services/
    digest.ts  ❌ Needs creation
```

## Support

For questions or issues during implementation:
1. Check the database schema comments for field descriptions
2. Review type definitions in `types.ts` for data structure expectations
3. Test with dry_run mode first to validate behavior
4. Check Supabase Edge Function logs for debugging

The foundation is solid and most of the complex logic is written. The remaining work is primarily UI development and deployment integration.
