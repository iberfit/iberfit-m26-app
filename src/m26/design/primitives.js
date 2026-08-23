import {IBERFIT_DESIGN_TOKENS} from '../design/tokens.generated.js';

export const IBERFIT_PRIMITIVE_CONTRACT=Object.freeze({
  version:'58.3.1',
  noBusinessLogic:true,
  primitives:Object.freeze([
    'Button',
    'IconButton',
    'Link',
    'Field',
    'Input',
    'Textarea',
    'Select',
    'Checkbox',
    'Radio',
    'Switch',
    'Badge',
    'Chip',
    'Card',
    'Panel',
    'Metric',
    'KPI',
    'Alert',
    'Notice',
    'Toast',
    'Skeleton',
    'EmptyState',
    'ErrorState',
    'RetryState',
    'OfflineState',
    'SyncState',
    'Tooltip',
    'Popover',
    'Dialog',
    'Sheet',
    'Tabs',
    'SegmentedControl',
    'Progress',
    'TableShell',
    'FilterBar',
    'SearchField',
  ]),
  productStates:Object.freeze([
    'default',
    'hover',
    'focus-visible',
    'pressed',
    'selected',
    'disabled',
    'loading',
    'success',
    'warning',
    'error',
    'empty',
    'retry',
    'conflict',
    'offline',
    'syncing',
  ]),
  legacyCompatibility:Object.freeze({
    Button:Object.freeze([
      '.m26-primary-action',
      '.m26-text-action',
      '.m26-action-grid button',
      '.m26-inline-actions button',
      '.m26-list-card-actions button',
      '.m26-sticky-actions button',
      '.m26-wizard-actions button',
      '.m26-timer-actions button',
      '.m26-publication-actions button',
      '.m26-builder-toolbar button',
      '.m26-library-controls button',
      '.m26-external-report-actions button',
    ]),
    IconButton:Object.freeze(['.m26-icon-button']),
    Field:Object.freeze(['.m26-field']),
    Badge:Object.freeze([
      '.m26-badge',
      '.m26-admin-badge',
    ]),
    Card:Object.freeze([
      '.m26-panel',
      '.m26-stat',
      '.m26-list-card',
      '.m26-client-card',
      '.m26-library-card',
      '.m26-publication-card',
      '.m26-client-content-card',
      '.m26-wearable-source',
      '.m26-wearable-preview',
      '.m26-route-placeholder',
    ]),
    Notice:Object.freeze([
      '.m26-notice',
      '.m26-form-status',
      '.m26-action-state',
    ]),
    /* RC67_5_UNIFIED_LEGACY_BRIDGE_BEGIN */
    Panel:Object.freeze([
      '.m26-panel',
      '.m26-panel-soft',
    ]),
    Tabs:Object.freeze([
      '.m26-expediente-tabs',
    ]),
    SegmentedControl:Object.freeze([]),
    Metric:Object.freeze([
      '.m26-stat',
    ]),
    KPI:Object.freeze([
      '.m26-mini-metric',
    ]),
    Alert:Object.freeze([
      '.m26-alert-card',
    ]),
    EmptyState:Object.freeze([
      '.m26-empty',
      '.m26-admin-empty',
    ]),
    /* RC67_5_UNIFIED_LEGACY_BRIDGE_END */
  }),
});

export function primitiveContractAudit(){
  const contract=IBERFIT_PRIMITIVE_CONTRACT;
  const uniquePrimitives=new Set(contract.primitives);
  const uniqueStates=new Set(contract.productStates);
  const legacySelectors=Object.values(contract.legacyCompatibility).flat();

  return Object.freeze({
    ok:
      contract.noBusinessLogic===true &&
      uniquePrimitives.size===contract.primitives.length &&
      uniqueStates.size===contract.productStates.length &&
      legacySelectors.length>0 &&
      IBERFIT_DESIGN_TOKENS.size.touchTargetPx>=44,
    primitiveCount:contract.primitives.length,
    stateCount:contract.productStates.length,
    legacySelectorCount:legacySelectors.length,
    touchTargetPx:IBERFIT_DESIGN_TOKENS.size.touchTargetPx,
  });
}