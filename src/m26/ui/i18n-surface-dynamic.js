const SUPPORTED=new Set(['en','fr','pt']);

const TERM=Object.freeze({
  'confirmado':{en:'confirmed',fr:'confirmé',pt:'confirmado'},
  'revisado localmente':{en:'reviewed locally',fr:'vérifié localement',pt:'revisto localmente'},
  'sin métricas válidas':{en:'no valid metrics',fr:'aucune métrique valide',pt:'sem métricas válidas'},
  'atrasada':{en:'out of date',fr:'en retard',pt:'atrasada'},
  'obsoleta':{en:'obsolete',fr:'obsolète',pt:'obsoleta'},
  'actualizada':{en:'up to date',fr:'à jour',pt:'atualizada'},
  'fresca':{en:'up to date',fr:'à jour',pt:'atualizada'},
  'pendiente':{en:'pending',fr:'en attente',pt:'pendente'},
  'conectado':{en:'connected',fr:'connecté',pt:'ligado'},
  'sincronizando':{en:'syncing',fr:'synchronisation',pt:'a sincronizar'},
});

function tTerm(value,language,translatePart){
  const source=String(value??'').trim();
  const base=translatePart(source);
  if(base!==source)return base;
  return TERM[source]?.[language]??source;
}
function lang(value){
  const x=String(value||'').trim().toLowerCase();
  return SUPPORTED.has(x)?x:'en';
}
function pick(language,en,fr,pt){return language==='fr'?fr:language==='pt'?pt:en;}
function applyRules(value,language,translatePart){
  let m;
  if((m=value.match(/^(\d+) pendiente(?:s)?$/u)))return pick(language,`${m[1]} pending`,`${m[1]} en attente`,`${m[1]} pendente${m[1]==='1'?'':'s'}`);
  if((m=value.match(/^(\d+) por revisar$/u)))return pick(language,`${m[1]} to review`,`${m[1]} à vérifier`,`${m[1]} por rever`);
  if((m=value.match(/^IRI en preparación · (.+)$/u)))return pick(language,`IRI in preparation · ${tTerm(m[1],language,translatePart)}`,`IRI en préparation · ${tTerm(m[1],language,translatePart)}`,`IRI em preparação · ${tTerm(m[1],language,translatePart)}`);
  if((m=value.match(/^Tu acompañamiento, (.+)$/u)))return pick(language,`Your coaching, ${m[1]}`,`Votre accompagnement, ${m[1]}`,`O seu acompanhamento, ${m[1]}`);
  if((m=value.match(/^(.+): sin comparación$/u)))return pick(language,`${m[1]}: no comparison`,`${m[1]} : aucune comparaison`,`${m[1]}: sem comparação`);
  if((m=value.match(/^RPE ([\d.,]+) · esfuerzo percibido confirmado$/u)))return pick(language,`RPE ${m[1]} · confirmed perceived effort`,`RPE ${m[1]} · effort perçu confirmé`,`RPE ${m[1]} · esforço percebido confirmado`);
  if((m=value.match(/^(\d+) completadas sobre (\d+) registradas en el periodo$/u)))return pick(language,`${m[1]} completed out of ${m[2]} recorded in the period`,`${m[1]} terminées sur ${m[2]} enregistrées sur la période`,`${m[1]} concluídas de ${m[2]} registadas no período`);
  if((m=value.match(/^([\d.,]+) h\/día$/u)))return pick(language,`${m[1]} h/day`,`${m[1]} h/jour`,`${m[1]} h/dia`);
  if((m=value.match(/^(\d+) conexi(?:ón|ones) registrada(?:s)?$/u)))return pick(language,`${m[1]} registered connection${m[1]==='1'?'':'s'}`,`${m[1]} connexion${m[1]==='1'?'':'s'} enregistrée${m[1]==='1'?'':'s'}`,`${m[1]} ${m[1]==='1'?'ligação registada':'ligações registadas'}`);
  if((m=value.match(/^Calidad (.+?)(?: · (\d+) muestra(?:s)? excluida(?:s)? de métricas)?$/u))){
    const grade=m[1];
    if(!m[2])return pick(language,`Quality ${grade}`,`Qualité ${grade}`,`Qualidade ${grade}`);
    const n=m[2];
    return pick(language,`Quality ${grade} · ${n} sample${n==='1'?'':'s'} excluded from metrics`,`Qualité ${grade} · ${n} échantillon${n==='1'?'':'s'} exclu${n==='1'?'':'s'} des métriques`,`Qualidade ${grade} · ${n} amostra${n==='1'?'':'s'} excluída${n==='1'?'':'s'} das métricas`);
  }
  if((m=value.match(/^vs\. exposición anterior (.+)$/u)))return pick(language,`vs. previous exposure ${m[1]}`,`vs exposition précédente ${m[1]}`,`vs. exposição anterior ${m[1]}`);
  if((m=value.match(/^Evolución confirmada de (.+) en (.+)$/u)))return pick(language,`Confirmed ${m[1]} trend for ${m[2]}`,`Évolution confirmée de ${m[1]} pour ${m[2]}`,`Evolução confirmada de ${m[1]} em ${m[2]}`);
  if((m=value.match(/^Esfuerzo último: (.+)$/u)))return pick(language,`Latest effort: ${m[1]}`,`Dernier effort : ${m[1]}`,`Esforço mais recente: ${m[1]}`);
  if((m=value.match(/^(.+) vs\. exposición anterior$/u)))return pick(language,`${m[1]} vs. previous exposure`,`${m[1]} vs exposition précédente`,`${m[1]} vs. exposição anterior`);
  if((m=value.match(/^(\d+) exposiciones confirmadas · calidad (.+)$/u)))return pick(language,`${m[1]} confirmed exposures · quality ${m[2]}`,`${m[1]} expositions confirmées · qualité ${m[2]}`,`${m[1]} exposições confirmadas · qualidade ${m[2]}`);
  if((m=value.match(/^Última exposición · (.+)$/u)))return pick(language,`Latest exposure · ${m[1]}`,`Dernière exposition · ${m[1]}`,`Última exposição · ${m[1]}`);
  if((m=value.match(/^(\d+) ejercicio(?:s)? con evolución comparable$/u)))return pick(language,`${m[1]} exercise${m[1]==='1'?'':'s'} with comparable progress`,`${m[1]} exercice${m[1]==='1'?'':'s'} avec évolution comparable`,`${m[1]} exercício${m[1]==='1'?'':'s'} com evolução comparável`);
  if((m=value.match(/^(.+) · (.+) · ventana de (\d+) días$/u)))return pick(language,`${m[1]} · ${m[2]} · ${m[3]}-day window`,`${m[1]} · ${m[2]} · fenêtre de ${m[3]} jours`,`${m[1]} · ${m[2]} · janela de ${m[3]} dias`);
  if((m=value.match(/^(\d+) de (\d+) sesiones confirmadas(?: en 28 días)?$/u)))return pick(language,`${m[1]} of ${m[2]} confirmed sessions${value.endsWith('en 28 días')?' in 28 days':''}`,`${m[1]} séances confirmées sur ${m[2]}${value.endsWith('en 28 días')?' en 28 jours':''}`,`${m[1]} de ${m[2]} sessões confirmadas${value.endsWith('en 28 días')?' em 28 dias':''}`);
  if((m=value.match(/^(\d+) evaluación(?:es)? en el historial$/u)))return pick(language,`${m[1]} assessment${m[1]==='1'?'':'s'} in history`,`${m[1]} évaluation${m[1]==='1'?'':'s'} dans l’historique`,`${m[1]} ${m[1]==='1'?'avaliação':'avaliações'} no histórico`);
  if((m=value.match(/^Último: (.+)$/u)))return pick(language,`Latest: ${m[1]}`,`Dernier : ${m[1]}`,`Último: ${m[1]}`);
  if((m=value.match(/^(\d+) día(?:s)? con datos$/u)))return pick(language,`${m[1]} day${m[1]==='1'?'':'s'} with data`,`${m[1]} jour${m[1]==='1'?'':'s'} avec des données`,`${m[1]} dia${m[1]==='1'?'':'s'} com dados`);
  if((m=value.match(/^(\d+) sesión(?:es)? fuera del cálculo hasta confirmar$/u)))return pick(language,`${m[1]} session${m[1]==='1'?'':'s'} excluded until confirmed`,`${m[1]} séance${m[1]==='1'?'':'s'} exclue${m[1]==='1'?'':'s'} jusqu’à confirmation`,`${m[1]} ${m[1]==='1'?'sessão':'sessões'} fora do cálculo até confirmação`);
  if((m=value.match(/^(\d+) ejercicio(?:s)? visible(?:s)? con los filtros actuales\.$/u)))return pick(language,`${m[1]} exercise${m[1]==='1'?'':'s'} visible with the current filters.`,`${m[1]} exercice${m[1]==='1'?'':'s'} visible${m[1]==='1'?'':'s'} avec les filtres actuels.`,`${m[1]} ${m[1]==='1'?'exercício visível':'exercícios visíveis'} com os filtros atuais.`);
  if((m=value.match(/^(\d+) cliente(?:s)? encontrado(?:s)? con búsqueda tolerante\.$/u)))return pick(language,`${m[1]} client${m[1]==='1'?'':'s'} found with tolerant search.`,`${m[1]} client${m[1]==='1'?'':'s'} trouvé${m[1]==='1'?'':'s'} avec la recherche tolérante.`,`${m[1]} cliente${m[1]==='1'?'':'s'} encontrado${m[1]==='1'?'':'s'} com pesquisa tolerante.`);
  if((m=value.match(/^(\d+) cliente(?:s)? visible(?:s)? con los filtros actuales\.$/u)))return pick(language,`${m[1]} client${m[1]==='1'?'':'s'} visible with the current filters.`,`${m[1]} client${m[1]==='1'?'':'s'} visible${m[1]==='1'?'':'s'} avec les filtres actuels.`,`${m[1]} ${m[1]==='1'?'cliente visível':'clientes visíveis'} com os filtros atuais.`);
  if((m=value.match(/^Expediente de (.+) creado\. Continúa con la primera sesión\.$/u)))return pick(language,`Record for ${m[1]} created. Continue with the first session.`,`Dossier de ${m[1]} créé. Continuez avec la première séance.`,`Processo de ${m[1]} criado. Continue com a primeira sessão.`);
  if((m=value.match(/^No puedes confirmar todavía: faltan (\d+) elemento(?:s)?\. (.+)\.$/u)))return pick(language,`You cannot confirm yet: ${m[1]} item${m[1]==='1'?' is':'s are'} missing. ${m[2]}.`,`Vous ne pouvez pas encore confirmer : ${m[1]} élément${m[1]==='1'?' manque':'s manquent'}. ${m[2]}.`,`Ainda não pode confirmar: faltam ${m[1]} elemento${m[1]==='1'?'':'s'}. ${m[2]}.`);
  if((m=value.match(/^El IRI confirmado no puede convertirse todavía en informe: (.+)\.$/u)))return pick(language,`The confirmed IRI cannot yet be converted into a report: ${m[1]}.`,`L’IRI confirmé ne peut pas encore être converti en rapport : ${m[1]}.`,`O IRI confirmado ainda não pode ser convertido em relatório: ${m[1]}.`);
  if((m=value.match(/^(\d+) ejercicios con historial$/u)))return pick(language,`${m[1]} exercises with history`,`${m[1]} exercices avec historique`,`${m[1]} exercícios com histórico`);
  if((m=value.match(/^(\d+) ejercicios propuestos$/u)))return pick(language,`${m[1]} proposed exercises`,`${m[1]} exercices proposés`,`${m[1]} exercícios propostos`);
  if((m=value.match(/^(\d+) min · (.+) · revisión del entrenador obligatoria\.$/u)))return pick(language,`${m[1]} min · ${m[2]} · Coach review required.`,`${m[1]} min · ${m[2]} · validation du Coach obligatoire.`,`${m[1]} min · ${m[2]} · revisão obrigatória do Coach.`);
  if((m=value.match(/^(.+) · última carga ([\d.,]+) kg$/u)))return pick(language,`${m[1]} · latest load ${m[2]} kg`,`${m[1]} · dernière charge ${m[2]} kg`,`${m[1]} · última carga ${m[2]} kg`);
  if((m=value.match(/^Contexto de dispositivos (.+) \((.+), (\d+) día(?:s)?\): (.+)\.(?: Datos no sincronizados\.)?$/u))){
    const review=tTerm(m[1],language,translatePart);
    const end=value.endsWith('Datos no sincronizados.')?pick(language,' Data not synced.',' Données non synchronisées.',' Dados não sincronizados.'):'';
    return pick(language,`Device context ${review} (${m[2]}, ${m[3]} day${m[3]==='1'?'':'s'}): ${tTerm(m[4],language,translatePart)}.${end}`,`Contexte des appareils ${review} (${m[2]}, ${m[3]} jour${m[3]==='1'?'':'s'}) : ${tTerm(m[4],language,translatePart)}.${end}`,`Contexto de dispositivos ${review} (${m[2]}, ${m[3]} dia${m[3]==='1'?'':'s'}): ${tTerm(m[4],language,translatePart)}.${end}`);
  }
  if((m=value.match(/^(\d+) registro(?:s)? pendiente(?:s)?\.$/u)))return pick(language,`${m[1]} pending record${m[1]==='1'?'':'s'}.`,`${m[1]} enregistrement${m[1]==='1'?'':'s'} en attente.`,`${m[1]} registo${m[1]==='1'?'':'s'} pendente${m[1]==='1'?'':'s'}.`);
  if((m=value.match(/^(.+) sincronizado con (\d+) permiso(?:s)? de lectura\.$/u)))return pick(language,`${m[1]} synced with ${m[2]} read permission${m[2]==='1'?'':'s'}.`,`${m[1]} synchronisé avec ${m[2]} autorisation${m[2]==='1'?'':'s'} de lecture.`,`${m[1]} sincronizado com ${m[2]} ${m[2]==='1'?'permissão':'permissões'} de leitura.`);
  if((m=value.match(/^(.+) conectado\. No hay resúmenes disponibles en el periodo seleccionado\.$/u)))return pick(language,`${m[1]} connected. No summaries are available for the selected period.`,`${m[1]} connecté. Aucun résumé n’est disponible pour la période sélectionnée.`,`${m[1]} ligado. Não há resumos disponíveis no período selecionado.`);
  if((m=value.match(/^(.+) Código: ([A-Z0-9_:-]+)\.$/u))){
    const prefix=tTerm(m[1],language,translatePart);
    return pick(language,`${prefix} Code: ${m[2]}.`,`${prefix} Code : ${m[2]}.`,`${prefix} Código: ${m[2]}.`);
  }
  if((m=value.match(/^Energía ([\d.,]+)$/u)))return pick(language,`Energy ${m[1]}`,`Énergie ${m[1]}`,`Energia ${m[1]}`);
  if((m=value.match(/^Sueño ([\d.,]+)$/u)))return pick(language,`Sleep ${m[1]}`,`Sommeil ${m[1]}`,`Sono ${m[1]}`);
  if((m=value.match(/^Estrés ([\d.,]+)$/u)))return pick(language,`Stress ${m[1]}`,`Stress ${m[1]}`,`Stress ${m[1]}`);
  if((m=value.match(/^(\d+) de (\d+) sesiones confirmadas en 28 días · (\d+) pendiente(?:s)? fuera del cálculo$/u)))return pick(language,`${m[1]} of ${m[2]} confirmed sessions in 28 days · ${m[3]} pending excluded from calculation`,`${m[1]} séances confirmées sur ${m[2]} en 28 jours · ${m[3]} en attente hors calcul`,`${m[1]} de ${m[2]} sessões confirmadas em 28 dias · ${m[3]} pendente${m[3]==='1'?'':'s'} fora do cálculo`);
  if((m=value.match(/^Último registro · (.+)$/u)))return pick(language,`Latest record · ${m[1]}`,`Dernier enregistrement · ${m[1]}`,`Último registo · ${m[1]}`);
  if((m=value.match(/^Sesión confirmada · (.+)$/u)))return pick(language,`Confirmed session · ${m[1]}`,`Séance confirmée · ${m[1]}`,`Sessão confirmada · ${m[1]}`);
  if((m=value.match(/^Plantilla “(.+)” guardada como versión (.+)\.$/u)))return pick(language,`Template “${m[1]}” saved as version ${m[2]}.`,`Modèle « ${m[1]} » enregistré comme version ${m[2]}.`,`Modelo “${m[1]}” guardado como versão ${m[2]}.`);
  if((m=value.match(/^Operación (.+)\. (Requiere revisión\.|Sin incidencias registradas\.)$/u)))return pick(language,`Operation ${m[1]}. ${m[2]==='Requiere revisión.'?'Review required.':'No issues recorded.'}`,`Opération ${m[1]}. ${m[2]==='Requiere revisión.'?'Vérification requise.':'Aucun incident enregistré.'}`,`Operação ${m[1]}. ${m[2]==='Requiere revisión.'?'Requer revisão.':'Sem incidentes registados.'}`);
  if((m=value.match(/^(.+) · (\d+) pendiente(?:s)? fuera del cálculo$/u)))return pick(language,`${m[1]} · ${m[2]} pending excluded from calculation`,`${m[1]} · ${m[2]} en attente hors calcul`,`${m[1]} · ${m[2]} pendente${m[2]==='1'?'':'s'} fora do cálculo`);
  if((m=value.match(/^(\d+) comunicaciones por revisar$/u)))return pick(language,`${m[1]} communications to review`,`${m[1]} communications à vérifier`,`${m[1]} comunicações por rever`);
  if((m=value.match(/^(.+): la conexión requiere revisión\. Los datos confirmados existentes no se alteran\.$/u)))return pick(language,`${m[1]}: the connection needs review. Existing confirmed data is unchanged.`,`${m[1]} : la connexion doit être vérifiée. Les données confirmées existantes restent inchangées.`,`${m[1]}: a ligação requer revisão. Os dados confirmados existentes não são alterados.`);
  if((m=value.match(/^(.+): la última sincronización está (.+)\. Revisa Dispositivos si quieres actualizar el contexto\.$/u)))return pick(language,`${m[1]}: the latest sync is ${tTerm(m[2],language,translatePart)}. Review Devices if you want to update the context.`,`${m[1]} : la dernière synchronisation est ${tTerm(m[2],language,translatePart)}. Vérifiez Appareils pour actualiser le contexte.`,`${m[1]}: a última sincronização está ${tTerm(m[2],language,translatePart)}. Reveja Dispositivos se quiser atualizar o contexto.`);
  if((m=value.match(/^(.+) · activación operativa por verificar$/u)))return pick(language,`${m[1]} · operational activation to verify`,`${m[1]} · activation opérationnelle à vérifier`,`${m[1]} · ativação operacional por verificar`);
  if((m=value.match(/^(.+) · sesión en este dispositivo$/u)))return pick(language,`${m[1]} · session on this device`,`${m[1]} · session sur cet appareil`,`${m[1]} · sessão neste dispositivo`);
  if((m=value.match(/^(.+) · última sincronización (.+)\. Solo se usan datos confirmados como contexto\.$/u)))return pick(language,`${m[1]} · latest sync ${m[2]}. Only confirmed data is used as context.`,`${m[1]} · dernière synchronisation ${m[2]}. Seules les données confirmées sont utilisées comme contexte.`,`${m[1]} · última sincronização ${m[2]}. Apenas dados confirmados são usados como contexto.`);
  return value;
}

export function iberfitDynamicSurfaceTranslate(value,{language='en',translatePart=(x)=>String(x??'')}={}){
  const source=String(value??'');
  if(!source.trim())return source;
  const selected=lang(language);
  return applyRules(source,selected,(part)=>String(translatePart(part)??part));
}
