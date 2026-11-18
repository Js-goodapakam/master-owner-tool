/**
 * Curated official developer references. Feasibility is NOT a connected-state assertion.
 * Reviewed 2026-11-18. Never expose property-level credentials in this registry.
 */
export const otaProviders = [
  {
    id: 'go-mmt', name: 'MakeMyTrip / Goibibo', type: 'Direct OTA',
    priority: 'High', feasibility: 'Partner approval required',
    auth: 'Partner connectivity approval; property Hotel Code and Access Token are configured in Engage Stay',
    capabilities: ['Availability & inventory', 'Rates & restrictions', 'Reservation synchronization'],
    requirements: ['Obtain channel-manager provider approval from Go-MMT', 'Use the property Hotel Code and Access Token only within the property connection flow', 'Confirm API specification, certification and contractual access with Go-MMT'],
    docsUrl: 'https://partners.go-mmt.com/support/solutions/articles/81000197192-how-can-i-map-my-property-s-channel-manager-with-ingo-mmt-extranet-',
    notes: 'Go-MMT documents property-side channel-manager mapping. Public help documentation is not a grant of provider API access.',
    supportsLiveVerification: false,
  },
  {
    id: 'booking', name: 'Booking.com', type: 'Direct OTA',
    priority: 'High', feasibility: 'Partner onboarding required',
    auth: 'Connectivity Provider ID and machine-account/token-based authentication following provider onboarding',
    capabilities: ['Availability & rates', 'Reservation retrieval / notifications', 'Room / rate mappings', 'Property connections'],
    requirements: ['Connectivity Provider onboarding and permissions', 'Approved machine account and authentication', 'API compliance review before going live', 'Confirm current new-provider acceptance with Booking.com'],
    docsUrl: 'https://developers.booking.com/connectivity/docs',
    notes: 'Rate limits and API lifecycle/deprecations require adapter-level compliance. New provider acceptance must be verified directly.',
    supportsLiveVerification: false,
  },
  {
    id: 'agoda', name: 'Agoda YCS', type: 'Direct OTA',
    priority: 'High', feasibility: 'Certification required',
    auth: 'OAuth 2.0 client credentials with approved property authorization and IP allowlist',
    capabilities: ['GetProduct', 'SetAriV2', 'GetBookingList', 'GetBookingDetails', 'BookingHint (on approval)'],
    requirements: ['Apply to Agoda Connectivity', 'Implement the four mandatory YCS certification endpoints', 'Complete self-certification and 2–3-property pilot', 'Use OAuth 2.0; legacy API keys are being phased out by end-2026'],
    docsUrl: 'https://developer.agoda.com/supply/docs/ycs-api',
    notes: 'BookingHint is a separate near-real-time notification option; full reservation retrieval must still be implemented.',
    supportsLiveVerification: false,
  },
  {
    id: 'airbnb', name: 'Airbnb', type: 'Direct OTA',
    priority: 'High for homestays', feasibility: 'Partner approval required',
    auth: 'Airbnb-authorized software partnership and provider-defined authorization',
    capabilities: ['Listing synchronization (approval-dependent)', 'Availability', 'Reservations', 'Rates (approval-dependent)'],
    requirements: ['Airbnb API Program acceptance', 'NDA and partner-specific terms', 'Data-security review', 'Implement required API features under partnership rules'],
    docsUrl: 'https://www.airbnb.com/help/article/3418',
    notes: 'iCal is not a replacement for a real-time full API integration. Developer API access is not publicly self-service.',
    supportsLiveVerification: false,
  },
  {
    id: 'expedia', name: 'Expedia Group', type: 'Direct OTA',
    priority: 'Medium', feasibility: 'Partner onboarding required',
    auth: 'Connectivity Hub partner-issued authorization and API access',
    capabilities: ['Availability & Rates', 'Booking Notification / Retrieval', 'Room & Rate Product API'],
    requirements: ['Enroll as lodging connectivity provider', 'Complete relevant integration/certification requirements', 'Implement ARI, booking and product capabilities', 'Ensure booking and payment compliance where applicable'],
    docsUrl: 'https://developers.expediagroup.com/supply/lodging',
    notes: 'Use Lodging Supply/Connectivity APIs, not Expedia Rapid, which serves a different distribution use case.',
    supportsLiveVerification: false,
  },
  {
    id: 'channex', name: 'Channex', type: 'Channel-manager API',
    priority: 'Recommended evaluation', feasibility: 'Developer API available; account required',
    auth: 'API key (user-api-key header); staging and production environments',
    capabilities: ['Properties, rooms and rates', 'ARI sync', 'Bookings revision feed', 'OTA channel mapping', 'Webhooks'],
    requirements: ['Create Channex partner account', 'Generate staging/production API key', 'Validate credentials', 'Implement property mapping, ARI and booking revision acknowledgements', 'Review commercial terms'],
    docsUrl: 'https://docs.channex.io/guides/pms-integration-guide',
    notes: 'A successful credential check proves Channex API access only. It does not establish that any downstream OTA channel is mapped.',
    supportsLiveVerification: true,
  },
  {
    id: 'siteminder', name: 'SiteMinder pmsXchange', type: 'Channel-manager API',
    priority: 'Alternative evaluation', feasibility: 'Partnership required',
    auth: 'SiteMinder partner credentials following onboarding',
    capabilities: ['Rates & availability', 'Reservations', 'Restrictions', 'PMS channel connectivity'],
    requirements: ['Contact SiteMinder for integration partnership', 'Review pmsXchange guide and certification scope', 'Complete provider connection validation'],
    docsUrl: 'https://developer.siteminder.com/',
    notes: 'Evaluate commercial and API access requirements before selecting as aggregator.',
    supportsLiveVerification: false,
  },
] as const;

export type OtaProviderId = (typeof otaProviders)[number]['id'];
export const otaProviderIds = otaProviders.map(provider => provider.id) as string[];
