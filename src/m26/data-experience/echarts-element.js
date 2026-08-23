import {IBERFIT_DESIGN_TOKENS} from '../design/tokens.generated.js';
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

function chartInputPoint(point){
  const dated=chartPoint(point);

  if(dated){
    return Object.freeze({
      category:dated.date,
      date:dated.date,
      value:dated.value,
    });
  }

  const value=finite(point?.value);
  const label=String(point?.label||'').trim();

  return value===null||!label
    ?null
    :Object.freeze({
        category:label,
        date:null,
        value,
      });
}

function chartToneColor(tone){
  const dataViz=IBERFIT_DESIGN_TOKENS.color.dataViz;

  return ({
    default:dataViz.series1,
    positive:dataViz.series1,
    negative:dataViz.series5,
    stable:dataViz.series6,
    neutral:dataViz.series3,
  })[String(tone||'default')]
    ||dataViz.series1;
}

export function buildLongitudinalLineOption({
  points=[],
  label='Métrica',
  unit='',
  description='',
  reducedMotion=false,
  tone='default',
  density='standard',
}={}){
  const normalized=(Array.isArray(points)?points:[])
    .map(chartInputPoint)
    .filter(Boolean);

  const compact=
    String(density||'standard')==='compact';

  const dataViz=
    IBERFIT_DESIGN_TOKENS.color.dataViz;

  const semantic=
    IBERFIT_DESIGN_TOKENS.color.semantic;

  const primitive=
    IBERFIT_DESIGN_TOKENS.color.primitive;

  const seriesColor=
    chartToneColor(tone);

  const fullyDated=
    normalized.length>0&&
    normalized.every((point)=>Boolean(point.date));

  const axisText=
    semantic.textSecondary;

  return Object.freeze({
    animation:!reducedMotion,

    aria:Object.freeze({
      enabled:true,
      label:Object.freeze({
        description:
          description
          ||(
            fullyDated
              ?`${label}: serie temporal de ${normalized.length} días con datos.`
              :`${label}: serie de ${normalized.length} registros comparables.`
          ),
      }),
    }),

    color:Object.freeze([
      seriesColor,
    ]),

    textStyle:Object.freeze({
      color:axisText,
      fontFamily:
        IBERFIT_DESIGN_TOKENS.typography.family.ui,
    }),

    grid:compact
      ?Object.freeze({
          left:12,
          right:10,
          top:14,
          bottom:22,
          containLabel:false,
        })
      :Object.freeze({
          left:48,
          right:16,
          top:26,
          bottom:36,
          containLabel:false,
        }),

    tooltip:Object.freeze({
      trigger:'axis',
      confine:true,
      backgroundColor:semantic.surfaceOverlay,
      borderColor:semantic.border,
      textStyle:Object.freeze({
        color:semantic.textPrimary,
      }),
    }),

    xAxis:Object.freeze({
      type:'category',
      boundaryGap:false,
      data:Object.freeze(
        normalized.map((point)=>point.category)
      ),
      axisLabel:Object.freeze({
        hideOverlap:true,
        color:axisText,
        ...(compact
          ?Object.freeze({
              fontSize:10,
            })
          :{}),
      }),
      axisLine:Object.freeze({
        show:!compact,
        lineStyle:Object.freeze({
          color:dataViz.grid,
        }),
      }),
      axisTick:Object.freeze({
        show:false,
      }),
    }),

    yAxis:compact
      ?Object.freeze({
          type:'value',
          scale:true,
          name:'',
          nameGap:8,
          show:false,
          splitLine:Object.freeze({
            show:true,
            lineStyle:Object.freeze({
              color:dataViz.grid,
            }),
          }),
        })
      :Object.freeze({
          type:'value',
          scale:true,
          name:String(unit||''),
          nameGap:8,
          axisLabel:Object.freeze({
            color:axisText,
          }),
          axisLine:Object.freeze({
            show:false,
          }),
          axisTick:Object.freeze({
            show:false,
          }),
          splitLine:Object.freeze({
            show:true,
            lineStyle:Object.freeze({
              color:dataViz.grid,
            }),
          }),
        }),

    series:Object.freeze([
      Object.freeze({
        name:String(label||'Métrica'),
        type:'line',
        data:Object.freeze(
          normalized.map((point)=>point.value)
        ),
        showSymbol:
          compact
          ||normalized.length<=20,
        symbolSize:
          compact
            ?6
            :5,
        smooth:
          compact
            ?0.28
            :0.2,
        connectNulls:false,
        lineStyle:Object.freeze({
          width:
            compact
              ?2.35
              :2,
        }),
        areaStyle:Object.freeze({
          opacity:
            compact
              ?0.1
              :0.08,
        }),
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
            tone:
              this.getAttribute('data-tone')
              ||'default',
            density:
              this.getAttribute('data-density')
              ||'standard',
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