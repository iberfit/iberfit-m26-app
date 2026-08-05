import {
  normalizeWearableProvider,
  WEARABLE_PROVIDERS,
} from './contracts.js';

function policy(definition) {
  return Object.freeze({
    ...definition,
    fileImportAllowed: true,
    directLabel: definition.label,
  });
}

export const ZERO_COST_POLICY = Object.freeze({
  normalized_file: policy({
    provider: 'normalized_file',
    tier: 'free_now',
    developmentAllowed: true,
    productionAllowed: true,
    requiresExternalAccount: false,
    reason: null,
    label: 'Disponible ahora',
  }),
  health_connect: policy({
    provider: 'health_connect',
    tier: 'free_development',
    developmentAllowed: true,
    productionAllowed: false,
    requiresExternalAccount: false,
    reason: 'M26_NATIVE_ANDROID_BRIDGE_REQUIRED',
    label: 'Requiere aplicación Android',
  }),
  samsung_health: policy({
    provider: 'samsung_health',
    tier: 'free_development',
    developmentAllowed: true,
    productionAllowed: false,
    requiresExternalAccount: false,
    reason: 'M26_HEALTH_CONNECT_BRIDGE_REQUIRED',
    label: 'Mediante Health Connect',
  }),
  strava: policy({
    provider: 'strava',
    tier: 'free_registration',
    developmentAllowed: true,
    productionAllowed: false,
    requiresExternalAccount: true,
    reason: 'M26_STRAVA_SERVER_OAUTH_REQUIRED',
    label: 'Requiere autorización segura',
  }),
  apple_health: policy({
    provider: 'apple_health',
    tier: 'paid_distribution',
    developmentAllowed: false,
    productionAllowed: false,
    requiresExternalAccount: true,
    reason: 'M26_ZERO_COST_POLICY_BLOCKED',
    label: 'En pausa por coste',
  }),
  garmin_connect: policy({
    provider: 'garmin_connect',
    tier: 'partner_access',
    developmentAllowed: false,
    productionAllowed: false,
    requiresExternalAccount: true,
    reason: 'M26_PARTNER_OR_COMMERCIAL_ACCESS_REQUIRED',
    label: 'No activar',
  }),
  fitbit: policy({
    provider: 'fitbit',
    tier: 'restricted_review',
    developmentAllowed: true,
    productionAllowed: false,
    requiresExternalAccount: true,
    reason: 'M26_RESTRICTED_OAUTH_REVIEW_REQUIRED',
    label: 'Evaluación gratuita',
  }),
  oura: policy({
    provider: 'oura',
    tier: 'external_oauth',
    developmentAllowed: false,
    productionAllowed: false,
    requiresExternalAccount: true,
    reason: 'M26_FREE_ACCESS_NOT_CONFIRMED',
    label: 'En espera',
  }),
});

export function wearableZeroCostPolicy(provider) {
  const key = normalizeWearableProvider(provider);
  return key ? ZERO_COST_POLICY[key] || null : null;
}

export function zeroCostProviderReadiness(items = []) {
  return Object.freeze(
    (Array.isArray(items) ? items : []).map((item) => {
      const policy = wearableZeroCostPolicy(item.key);
      const usableNow = Boolean(
        item.available &&
          policy?.developmentAllowed &&
          policy?.productionAllowed
      );
      const importReady = Boolean(policy?.fileImportAllowed);
      const nativeReady = Boolean(
        item.available &&
          policy?.developmentAllowed &&
          item.mode === 'native_bridge'
      );
      return Object.freeze({
        ...item,
        policy,
        importReady,
        nativeReady,
        usableNow,
        directBlocked: !usableNow,
        activationBlocked:
          !policy?.developmentAllowed ||
          !policy?.productionAllowed ||
          !item.available,
      });
    })
  );
}

export function assertZeroCostDevelopmentAllowed(provider) {
  const definition = WEARABLE_PROVIDERS[normalizeWearableProvider(provider)];
  if (!definition) throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
  const policy = wearableZeroCostPolicy(definition.key);
  if (!policy?.developmentAllowed) {
    throw new Error(policy?.reason || 'M26_ZERO_COST_POLICY_BLOCKED');
  }
  return Object.freeze({ definition, policy });
}
