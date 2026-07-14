# Post Error Tracking Implementation

## Summary
Added comprehensive error tracking to the listing submission flow without changing any user-visible behavior. When a listing creation fails, the error is now logged to analytics with sanitized payload data for debugging.

## Changes Made

### 1. Analytics Type Definitions (`src/lib/analytics.types.ts`)
- Added new event type: `'post_error'` to the `AnalyticsEventName` union type

### 2. Analytics Core (`src/lib/analytics.ts`)
- **Added new function**: `trackPostError(error: unknown, payload?: Record<string, any>): void`
  - Captures error information (message, name)
  - Associates error with the current post attempt ID
  - Sanitizes listing payload to include only non-PII fields:
    - `bedrooms`, `bathrooms`, `property_type`, `neighborhood`
    - `parking`, `lease_length`, `is_featured`, `call_for_price`
    - `has_price` (boolean flag instead of actual price value)
  - Sends `post_error` event to analytics backend
- Exported `trackPostError` in the default export object

### 3. Post Listing Page (`src/pages/PostListing.tsx`)
- **Import updated**: Added `trackPostError` to the imports from `../lib/analytics`
- **Error handler updated**: In the `submitListingContent` catch block (line 764-793):
  - Added call to `trackPostError()` immediately after logging the error
  - Passes the error object and sanitized form data
  - Existing error message logic remains unchanged
  - User still sees the same alert messages

## Event Data Structure

When a `post_error` event is tracked, it includes:

```typescript
{
  attempt_id: string,        // Links to post_started/post_submitted events
  error_message: string,     // Error message text
  error_name?: string,       // Error type/name if available
  payload?: {                // Sanitized listing data
    bedrooms: number,
    bathrooms: number,
    property_type: string,
    neighborhood: string,
    parking: string,
    lease_length?: string,
    is_featured: boolean,
    call_for_price: boolean,
    has_price: boolean       // Flag only, not actual price
  }
}
```

## Analytics Flow

The complete posting flow now tracks:

1. **post_started** - User begins filling out form
2. **post_submitted** - User clicks submit button (validation passed)
3. **post_error** - Listing creation failed ← NEW
4. **post_success** - Listing created successfully
5. **post_abandoned** - User navigates away without completing

## User Experience

- **No changes** to error messages shown to users
- **No changes** to UI/UX flow
- **No changes** to form validation
- Errors are silently logged to analytics for debugging

## Benefits

1. **Debug support**: Developers can now see what data causes listing creation failures
2. **Error patterns**: Analytics can reveal common failure scenarios
3. **Privacy compliant**: No PII (names, phone numbers, addresses) is logged
4. **Attempt tracking**: Errors are linked to specific post attempts for context
5. **Error categorization**: Can identify if errors are permission-related, validation-related, etc.

## Testing

- Build completed successfully ✓
- TypeScript compilation passed ✓
- No runtime changes to user-facing behavior ✓
