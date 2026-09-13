import {IBERFIT_DESIGN_TOKENS} from '../design/tokens.generated.js';
import {finiteOptionalNumber} from '../domain/optional-number.js';
export const ECHARTS_DATA_EXPERIENCE_VERSION='6.1.0';
export const ECHARTS_VENDOR_URL='/m26/vendor/echarts-6.1.0.esm.min.js';

let echartsModulePromise=null;

function loadEchartsModule(){
  if(!echartsModulePromise){
    echartsModulePromise=import(ECHARTS_VENDOR_URL)
      .catch((error)=>{
        echartsModulePromise=null;
        throw error;
      });
  }
  return echartsModulePromise;
}

function requestFrame(callback){
  if(typeof globalThis.requestAnimationFrame==='function'){
    return Object.freeze({
      kind:'raf',
      id:globalThis.requestAnimationFrame(callback),
    });
  }
  return Object.freeze({
    kind:'timeout',
    id:globalThis.setTimeout?.(callback,16),
  });
}

function cancelFrame(frame){
  if(!frame)return;
  if(frame.kind==='raf'){
    globalThis.cancelAnimationFrame?.(frame.id);
    return;
  }
  globalThis.clearTimeout?.(frame.id);
}

function safeChartOperation(operation){
  if(typeof operation!=='function')return true;
  try{
    operation();
    return true;
  }catch{
    return false;
  }
}

function finite(value){
  return finiteOptionalNumber(value);
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

function formatChartCategory(value){
  const text=String(value||'').trim();
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match
    ?`${match[3]}/${match[2]}`
    :text;
}

function formatMetricValue(value,unit=''){
  const number=finite(value);
  if(number===null)return '—';
  const formatted=new Intl.NumberFormat('es-CL',{
    maximumFractionDigits:1,
    minimumFractionDigits:0,
  }).format(number);
  return `${formatted}${unit?` ${unit}`:''}`;
}

function referenceLineData({
  referenceValue=null,
  referenceLabel='Media 28 días',
  comparisonValue=null,
  comparisonLabel='28 días previos',
  unit='',
  compact=false,
  axisText='currentColor',
  currentColor='#888',
  comparisonColor='#999',
}={}){
  const lines=[];
  const current=finite(referenceValue);
  const previous=finite(comparisonValue);

  if(current!==null){
    lines.push(Object.freeze({
      name:String(referenceLabel||'Media 28 días'),
      yAxis:current,
      lineStyle:Object.freeze({
        color:currentColor,
        type:'solid',
        width:1.25,
        opacity:.78,
      }),
      label:Object.freeze({
        show:!compact,
        position:'insideEndTop',
        color:axisText,
        fontSize:10,
        formatter:`${String(referenceLabel||'Media 28 días')}: ${formatMetricValue(current,unit)}`,
      }),
    }));
  }

  if(previous!==null){
    lines.push(Object.freeze({
      name:String(comparisonLabel||'28 días previos'),
      yAxis:previous,
      lineStyle:Object.freeze({
        color:comparisonColor,
        type:'dashed',
        width:1.1,
        opacity:.7,
      }),
      label:Object.freeze({
        show:!compact,
        position:'insideEndBottom',
        color:axisText,
        fontSize:10,
        formatter:`${String(comparisonLabel||'28 días previos')}: ${formatMetricValue(previous,unit)}`,
      }),
    }));
  }

  return Object.freeze(lines);
}

function finiteAttribute(element,name){
  const raw=element?.getAttribute?.(name);
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  return finite(raw);
}

export function buildLongitudinalLineOption({
  points=[],
  label='Métrica',
  unit='',
  description='',
  reducedMotion=false,
  tone='default',
  density='standard',
  referenceValue=null,
  referenceLabel='Media 28 días',
  comparisonValue=null,
  comparisonLabel='28 días previos',
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

  const seriesColor=
    chartToneColor(tone);

  const fullyDated=
    normalized.length>0&&
    normalized.every((point)=>Boolean(point.date));

  const axisText=
    semantic.textSecondary;

  const references=referenceLineData({
    referenceValue,
    referenceLabel,
    comparisonValue,
    comparisonLabel,
    unit,
    compact,
    axisText,
    currentColor:dataViz.series3,
    comparisonColor:dataViz.series6,
  });

  const latest=normalized.at(-1)||null;

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
      axisPointer:Object.freeze({
        type:'line',
        lineStyle:Object.freeze({
          color:dataViz.grid,
          width:1,
        }),
      }),
      valueFormatter:(value)=>formatMetricValue(value,unit),
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
        formatter:formatChartCategory,
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
        emphasis:Object.freeze({
          focus:'series',
        }),
        markPoint:latest
          ?Object.freeze({
              silent:true,
              symbol:'circle',
              symbolSize:9,
              label:Object.freeze({show:false}),
              data:Object.freeze([
                Object.freeze({
                  coord:Object.freeze([
                    latest.category,
                    latest.value,
                  ]),
                  value:latest.value,
                }),
              ]),
            })
          :undefined,
        markLine:references.length
          ?Object.freeze({
              silent:true,
              symbol:Object.freeze(['none','none']),
              data:references,
            })
          :undefined,
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
    #resizeFrame=null;
    #started=false;
    #lifecycleVersion=0;

    connectedCallback(){
      const lifecycleVersion=++this.#lifecycleVersion;
      this.setAttribute('data-chart-state','pending');

      if(typeof globalThis.IntersectionObserver==='function'){
        try{
          this.#intersectionObserver=
            new globalThis.IntersectionObserver(
              (entries)=>{
                if(entries.some((entry)=>entry.isIntersecting)){
                  const observer=this.#intersectionObserver;
                  this.#intersectionObserver=null;
                  safeChartOperation(()=>observer?.disconnect?.());
                  void this.#start(lifecycleVersion);
                }
              },
              {rootMargin:'240px 0px'}
            );
          this.#intersectionObserver.observe(this);
          return;
        }catch{
          safeChartOperation(
            ()=>this.#intersectionObserver?.disconnect?.()
          );
          this.#intersectionObserver=null;
        }
      }

      void this.#start(lifecycleVersion);
    }

    disconnectedCallback(){
      this.#lifecycleVersion+=1;
      safeChartOperation(
        ()=>this.#intersectionObserver?.disconnect?.()
      );
      this.#intersectionObserver=null;
      safeChartOperation(
        ()=>this.#resizeObserver?.disconnect?.()
      );
      this.#resizeObserver=null;
      safeChartOperation(()=>cancelFrame(this.#resizeFrame));
      this.#resizeFrame=null;
      safeChartOperation(()=>this.#chart?.dispose?.());
      this.#chart=null;
      this.#started=false;
    }

    #renderUnavailable(){
      const resizeObserver=this.#resizeObserver;
      this.#resizeObserver=null;
      safeChartOperation(()=>resizeObserver?.disconnect?.());
      safeChartOperation(()=>cancelFrame(this.#resizeFrame));
      this.#resizeFrame=null;

      const chart=this.#chart;
      this.#chart=null;
      safeChartOperation(()=>chart?.dispose?.());

      this.setAttribute('data-chart-state','unavailable');
      this.textContent=
        'Gráfico no disponible. Los mismos datos siguen disponibles en la tabla.';
    }

    async #start(lifecycleVersion=this.#lifecycleVersion){
      if(
        this.#started
        ||lifecycleVersion!==this.#lifecycleVersion
      )return;
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
        const echarts=await loadEchartsModule();
        if(lifecycleVersion!==this.#lifecycleVersion)return;
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
            referenceValue:
              finiteAttribute(this,'data-reference-value'),
            referenceLabel:
              this.getAttribute('data-reference-label')
              ||'Media 28 días',
            comparisonValue:
              finiteAttribute(this,'data-comparison-value'),
            comparisonLabel:
              this.getAttribute('data-comparison-label')
              ||'28 días previos',
          }),
          {
            notMerge:true,
            lazyUpdate:true,
          }
        );

        if(typeof globalThis.ResizeObserver==='function'){
          try{
            this.#resizeObserver=
              new globalThis.ResizeObserver(
                ()=>{
                  if(this.#resizeFrame)return;
                  const chart=this.#chart;
                  const scheduled=safeChartOperation(()=>{
                    this.#resizeFrame=requestFrame(()=>{
                      this.#resizeFrame=null;
                      if(
                        lifecycleVersion!==this.#lifecycleVersion
                        ||chart!==this.#chart
                      )return;
                      const resized=safeChartOperation(
                        ()=>chart?.resize?.()
                      );
                      if(
                        !resized
                        &&chart===this.#chart
                        &&lifecycleVersion===this.#lifecycleVersion
                      ){
                        this.#renderUnavailable();
                      }
                    });
                  });
                  if(!scheduled){
                    this.#resizeFrame=null;
                    this.#renderUnavailable();
                  }
                }
              );
            this.#resizeObserver.observe(this);
          }catch{
            safeChartOperation(
              ()=>this.#resizeObserver?.disconnect?.()
            );
            this.#resizeObserver=null;
          }
        }

        this.setAttribute('data-chart-state','ready');
      }catch{
        this.#renderUnavailable();
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
  formatChartCategory,
  formatMetricValue,
  referenceLineData,
  finiteAttribute,
  loadEchartsModule,
  reducedMotion,
  canRegister,
  safeChartOperation,
});