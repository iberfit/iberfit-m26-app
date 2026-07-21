export const M26_DESIGN_TOKENS=Object.freeze({
  spacing:['0.25rem','0.5rem','0.75rem','1rem','1.5rem','2rem','3rem'],
  radius:{sm:'0.65rem',md:'0.9rem',lg:'1.25rem',pill:'999px'},
  touchTargetPx:44,
  maxContentPx:1440,
  breakpoints:{mobile:580,tablet:900},
  motion:{fast:140,normal:220},
});

export const M26_PALETTE=Object.freeze({
  forest950:'#07150f',forest900:'#0d2419',forest800:'#143424',forest700:'#1d4933',
  cream100:'#f7f1e4',cream300:'#ddd4c1',muted:'#c8c0af',gold500:'#c8a65d',gold300:'#e4cd98',
  danger:'#d79a91',success:'#8bc7a2',
});

function parseHex(value){const hex=String(value||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(hex))throw new Error('M26_COLOR_HEX_REQUIRED');return [0,2,4].map((offset)=>Number.parseInt(hex.slice(offset,offset+2),16)/255);}
export function relativeLuminance(value){const [r,g,b]=parseHex(value).map((channel)=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b;}
export function contrastRatio(foreground,background){const a=relativeLuminance(foreground);const b=relativeLuminance(background);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}
export function auditPaletteContrast(){
  const combinations=[
    ['primary-text',M26_PALETTE.cream100,M26_PALETTE.forest950,4.5],
    ['secondary-text',M26_PALETTE.cream300,M26_PALETTE.forest900,4.5],
    ['muted-text',M26_PALETTE.muted,M26_PALETTE.forest800,4.5],
    ['gold-label',M26_PALETTE.gold300,M26_PALETTE.forest900,4.5],
    ['gold-control',M26_PALETTE.gold500,M26_PALETTE.forest800,4.5],
    ['danger-state',M26_PALETTE.danger,M26_PALETTE.forest800,4.5],
    ['success-state',M26_PALETTE.success,M26_PALETTE.forest800,4.5],
  ].map(([name,foreground,background,minimum])=>{const ratio=contrastRatio(foreground,background);return Object.freeze({name,foreground,background,minimum,ratio:Number(ratio.toFixed(3)),ok:ratio>=minimum});});
  return Object.freeze({ok:combinations.every((item)=>item.ok),combinations:Object.freeze(combinations)});
}

export function auditDesignContract(css=''){
  const checks={
    touchTarget:/min-height:\s*(?:2\.75rem|44px|3\.1rem)/.test(css),
    focusVisible:/:focus-visible/.test(css),
    reducedMotion:/prefers-reduced-motion/.test(css),
    safeArea:/safe-area-inset/.test(css),
    mobile580:/max-width:\s*580px/.test(css),
    tablet900:/max-width:\s*900px/.test(css),
    highContrast:/prefers-contrast:\s*more/.test(css),
    darkScheme:/color-scheme:\s*dark/.test(css),
    mobileMetricDensity:/max-width:\s*420px[\s\S]*?m26-stat-grid[\s\S]*?repeat\(2/.test(css),
  };
  return {ok:Object.values(checks).every(Boolean),checks,palette:auditPaletteContrast()};
}
