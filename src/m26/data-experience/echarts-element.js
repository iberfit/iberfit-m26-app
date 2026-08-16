export const ECHARTS_DATA_EXPERIENCE_VERSION='6.1.0';
export const ECHARTS_VENDOR_URL='/m26/vendor/echarts-6.1.0.esm.min.js';

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function chartPoint(point){
  const value=finite(point?.value);
  const date=String(point?.date||'').trim();
  return value===null||!/^\d{4}-\d{2}-\d{2}$/u.test(date)
    ?null
    :Object.freeze({date,value});
}

export function buildLongitudinalLineOption({
  points=[],
  label='Métrica',
  unit='',
  description='',
  reducedMotion=false,
}={}){
  const normalized=(Array.isArray(points)?points:[])
    .map(chartPoint)
    .filter(Boolean);

  return Object.freeze({
    animation:!reducedMotion,
    aria:Object.freeze({
      enabled:true,
      label:Object.freeze({
        description:
          description
          ||`${label}: serie temporal de ${normalized.length} días con datos.`,
      }),
    }),
    grid:Object.freeze({
      left:48,
      right:16,
      top:26,
      bottom:36,
      containLabel:false,
    }),
    tooltip:Object.freeze({
      trigger:'axis',
      confine:true,
    }),
    xAxis:Object.freeze({
      type:'category',
      boundaryGap:false,
      data:Object.freeze(normalized.map((point)=>point.date)),
      axisLabel:Object.freeze({
        hideOverlap:true,
      }),
    }),
    yAxis:Object.freeze({
      type:'value',
      scale:true,
      name:String(unit||''),
      nameGap:8,
    }),
    series:Object.freeze([
      Object.freeze({
        name:String(label||'Métrica'),
        type:'line',
        data:Object.freeze(normalized.map((point)=>point.value)),
        showSymbol:normalized.length<=20,
        symbolSize:5,
        smooth:0.2,
        connectNulls:false,
        lineStyle:Object.freeze({width:2}),
        areaStyle:Object.freeze({opacity:0.08}),
      }),
    ]),
  });
}

function parsePoints(element){
  try{
    const parsed=JSON.parse(
      element.getAttribute('data-points')||'[]'
    );
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function reducedMotion(){
  return Boolean(
    globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches
  );
}

function canRegister(){
  return (
    typeof globalThis.HTMLElement==='function'
    &&typeof globalThis.customElements==='object'
    &&typeof globalThis.customElements?.define==='function'
  );
}

if(canRegister()&&!globalThis.customElements.get('m26-echart')){
  class M26EchartElement extends globalThis.HTMLElement{
    #chart=null;
    #resizeObserver=null;
    #intersectionObserver=null;
    #started=false;

    connectedCallback(){
      this.setAttribute('data-chart-state','pending');

      if(typeof globalThis.IntersectionObserver==='function'){
        this.#intersectionObserver=
          new globalThis.IntersectionObserver(
            (entries)=>{
              if(entries.some((entry)=>entry.isIntersecting)){
                this.#intersectionObserver?.disconnect();
                this.#intersectionObserver=null;
                void this.#start();
              }
            },
            {rootMargin:'240px 0px'}
          );
        this.#intersectionObserver.observe(this);
        return;
      }

      void this.#start();
    }

    disconnectedCallback(){
      this.#intersectionObserver?.disconnect();
      this.#intersectionObserver=null;
      this.#resizeObserver?.disconnect();
      this.#resizeObserver=null;
      this.#chart?.dispose?.();
      this.#chart=null;
      this.#started=false;
    }

    async #start(){
      if(this.#started)return;
      this.#started=true;

      const points=parsePoints(this);
      if(!points.length){
        this.setAttribute('data-chart-state','empty');
        this.textContent='Sin datos suficientes para dibujar este gráfico.';
        return;
      }

      const mount=globalThis.document?.createElement?.('div');
      if(!mount){
        this.setAttribute('data-chart-state','unavailable');
        return;
      }

      mount.className='m26-echart-canvas';
      mount.setAttribute('aria-hidden','true');
      this.replaceChildren(mount);

      try{
        const echarts=await import(ECHARTS_VENDOR_URL);
        if(typeof echarts?.init!=='function'){
          throw new Error('M26_ECHARTS_INIT_UNAVAILABLE');
        }

        this.#chart=echarts.init(
          mount,
          null,
          {renderer:'svg'}
        );

        this.#chart.setOption(
          buildLongitudinalLineOption({
            points,
            label:this.getAttribute('data-label')||'Métrica',
            unit:this.getAttribute('data-unit')||'',
            description:
              this.getAttribute('aria-label')
              ||this.getAttribute('data-label')
              ||'Serie temporal',
            reducedMotion:reducedMotion(),
          }),
          {
            notMerge:true,
            lazyUpdate:true,
          }
        );

        if(typeof globalThis.ResizeObserver==='function'){
          this.#resizeObserver=
            new globalThis.ResizeObserver(
              ()=>this.#chart?.resize?.()
            );
          this.#resizeObserver.observe(this);
        }

        this.setAttribute('data-chart-state','ready');
      }catch{
        this.#chart?.dispose?.();
        this.#chart=null;
        this.setAttribute('data-chart-state','unavailable');
        this.textContent=
          'Gráfico no disponible. Los mismos datos siguen disponibles en la tabla.';
      }
    }
  }

  globalThis.customElements.define(
    'm26-echart',
    M26EchartElement
  );
}

export const __echartsElementInternals=Object.freeze({
  chartPoint,
  reducedMotion,
  canRegister,
});