/**
 * Card Image Generator using Satori (JSX → SVG) + resvg-wasm (SVG → PNG)
 *
 * This module generates listing card images server-side without external services.
 * Uses the same design as the frontend ListingCard component.
 */

import satori from 'npm:satori@0.10.9';
import { Resvg } from 'npm:@resvg/resvg-js@2.6.0';

interface ListingCardData {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  location: string;
  cross_streets: string | null;
  neighborhood: string | null;
  broker_fee: boolean;
  parking: string | null;
  is_featured: boolean;
  property_type: string | null;
  lease_length: string | null;
  imageUrl: string | null;
  agency: string | null;
  ownerRole: string;
}

/**
 * Format price with proper currency formatting
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Get poster label (agency name or "Owner")
 */
function getPosterLabel(ownerRole: string, agency: string | null): string {
  if (ownerRole === 'agent' && agency) {
    return agency;
  }
  return 'Owner';
}

/**
 * Generate listing card JSX for Satori
 */
function generateCardJSX(listing: ListingCardData) {
  const hasParking = listing.parking === 'yes' || listing.parking === 'included';
  const displayLocation = listing.cross_streets || listing.location || '';

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '400px',
        height: '550px',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
      },
      children: [
        // Image section
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              width: '100%',
              height: '267px',
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: listing.imageUrl
              ? [
                  {
                    type: 'img',
                    props: {
                      src: listing.imageUrl,
                      style: {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      },
                    },
                  },
                ]
              : [
                  {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: '16px',
                        color: '#9ca3af',
                      },
                      children: 'No Image',
                    },
                  },
                ],
          },
        },
        // Content section
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
              flex: 1,
            },
            children: [
              // Price
              {
                type: 'div',
                props: {
                  style: {
                    marginBottom: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '28px',
                          fontWeight: 700,
                          color: '#1f2937',
                          lineHeight: 1.2,
                        },
                        children: listing.call_for_price
                          ? 'Call for Price'
                          : formatPrice(listing.price || 0),
                      },
                    },
                  ],
                },
              },
              // Specs (beds, baths, parking, broker fee)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#4b5563',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', gap: '4px' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              children: '🛏️',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              children: listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms}`,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', gap: '4px' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              children: '🛁',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              children: `${listing.bathrooms}`,
                            },
                          },
                        ],
                      },
                    },
                    ...(hasParking
                      ? [
                          {
                            type: 'div',
                            props: {
                              children: 'Parking',
                            },
                          },
                        ]
                      : []),
                    {
                      type: 'div',
                      props: {
                        style: {
                          padding: '2px 8px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          backgroundColor: '#f3f4f6',
                        },
                        children: listing.broker_fee ? 'Broker Fee' : 'No Fee',
                      },
                    },
                  ],
                },
              },
              // Location
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#4b5563',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        children: '📍',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                        children: displayLocation,
                      },
                    },
                  ],
                },
              },
              // Footer (poster + featured)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #f3f4f6',
                    fontSize: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { color: '#6b7280' },
                        children: `by ${getPosterLabel(listing.ownerRole, listing.agency)}`,
                      },
                    },
                    ...(listing.is_featured
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: {
                                padding: '2px 8px',
                                backgroundColor: '#ef4444',
                                color: '#ffffff',
                                borderRadius: '4px',
                              },
                              children: 'Featured',
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Generate PNG image from listing data using Satori + resvg-wasm
 *
 * @param listing - Listing data to render
 * @returns PNG image as Uint8Array
 */
export async function generateListingCardImage(
  listing: ListingCardData
): Promise<Uint8Array> {
  try {
    // Generate SVG from JSX using Satori
    const svg = await satori(generateCardJSX(listing), {
      width: 400,
      height: 550,
      fonts: [
        {
          name: 'Inter',
          data: await fetch('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff').then(
            (res) => res.arrayBuffer()
          ),
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: await fetch('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff').then(
            (res) => res.arrayBuffer()
          ),
          weight: 700,
          style: 'normal',
        },
      ],
    });

    // Convert SVG to PNG using resvg-wasm
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 400,
      },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return pngBuffer;
  } catch (error) {
    console.error('Error generating card image:', error);
    throw error;
  }
}
