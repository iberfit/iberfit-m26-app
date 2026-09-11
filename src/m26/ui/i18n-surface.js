import {getIberfitLanguage} from './i18n.js';
import {iberfitDynamicSurfaceTranslate} from './i18n-surface-dynamic.js';
import {iberfitExtraSurfaceTranslate} from './i18n-surface-extra.js';

// Static, deterministic surface catalogue. Spanish is the canonical source text;
// EN/FR/PT values are committed with the application and never generated at runtime.
const ROWS=Object.freeze([
  ['Cliente','Client','Client','Cliente'],
  ['Clientes','Clients','Clients','Clientes'],
  ['Sesión','Session','Séance','Sessão'],
  ['Sesiones','Sessions','Séances','Sessões'],
  ['Sesión IBERFIT','IBERFIT session','Séance IBERFIT','Sessão IBERFIT'],
  ['Entrenamiento','Training','Entraînement','Treino'],
  ['Entrenamientos','Training sessions','Entraînements','Treinos'],
  ['Agenda','Schedule','Agenda','Agenda'],
  ['Planificación','Planning','Planification','Planeamento'],
  ['Progreso','Progress','Progression','Progresso'],
  ['Recuperación FC 1 min','1-min HR recovery','Récupération FC à 1 min','Recuperação FC em 1 min'],
  ['Métrica','Metric','Métrique','Métrica'],
  ['Primera evaluación','First assessment','Première évaluation','Primeira avaliação'],
  ['Se establece la línea de base para futuras comparaciones.','This establishes the baseline for future comparisons.','Cette évaluation établit la référence pour les comparaisons futures.','Esta avaliação estabelece a linha de base para comparações futuras.'],
  ['Reevaluación registrada','Reassessment recorded','Réévaluation enregistrée','Reavaliação registada'],
  ['Seguimiento','Follow-up','Suivi','Acompanhamento'],
  ['Bienestar','Wellbeing','Bien-être','Bem-estar'],
  ['Datos','Data','Données','Dados'],
  ['Dispositivos','Devices','Appareils','Dispositivos'],
  ['Informe','Report','Rapport','Relatório'],
  ['Informes','Reports','Rapports','Relatórios'],
  ['Ejercicio','Exercise','Exercice','Exercício'],
  ['Ejercicios','Exercises','Exercices','Exercícios'],
  ['Cuenta','Account','Compte','Conta'],
  ['Contraseña','Password','Mot de passe','Palavra-passe'],
  ['Correo electrónico','Email address','Adresse e-mail','Endereço de e-mail'],
  ['Teléfono','Phone','Téléphone','Telefone'],
  ['Equipo','Team','Équipe','Equipa'],
  ['Acción','Action','Action','Ação'],
  ['Gestión','Management','Gestion','Gestão'],
  ['Configuración','Configuration','Configuration','Configuração'],
  ['Comunicación','Communication','Communication','Comunicação'],
  ['Auditoría','Audit','Audit','Auditoria'],
  ['Energía','Energy','Énergie','Energia'],
  ['Sueño','Sleep','Sommeil','Sono'],
  ['Estrés','Stress','Stress','Stress'],
  ['Motivación','Motivation','Motivation','Motivação'],
  ['Calidad del dato','Data quality','Qualité des données','Qualidade dos dados'],
  ['Sin dato','No data','Aucune donnée','Sem dados'],
  ['Sin datos','No data','Aucune donnée','Sem dados'],
  ['Sin fecha','No date','Aucune date','Sem data'],
  ['Sin estado','No status','Sans statut','Sem estado'],
  ['Sin registro','No record','Aucun enregistrement','Sem registo'],
  ['Sin acceso','No access','Aucun accès','Sem acesso'],
  ['Sin Coach','No Coach','Aucun Coach','Sem Coach'],
  ['Al día','Up to date','À jour','Em dia'],
  ['Por revisar','To review','À vérifier','Por rever'],
  ['Pendiente','Pending','En attente','Pendente'],
  ['En pausa','Paused','En pause','Em pausa'],
  ['No disponible','Unavailable','Indisponible','Indisponível'],
  ['Disponible','Available','Disponible','Disponível'],
  ['Estado por definir','Status to be set','Statut à définir','Estado por definir'],
  ['Fecha por confirmar','Date to be confirmed','Date à confirmer','Data por confirmar'],
  ['Próximas sesiones','Upcoming sessions','Prochaines séances','Próximas sessões'],
  ['Próxima sesión','Next session','Prochaine séance','Próxima sessão'],
  ['Próximo entrenamiento','Next training session','Prochain entraînement','Próximo treino'],
  ['Próxima cita confirmada','Next appointment confirmed','Prochain rendez-vous confirmé','Próxima consulta confirmada'],
  ['Cita confirmada','Appointment confirmed','Rendez-vous confirmé','Consulta confirmada'],
  ['Por confirmar','To be confirmed','À confirmer','Por confirmar'],
  ['Sin próxima cita','No upcoming appointment','Aucun prochain rendez-vous','Sem próxima consulta'],
  ['Sin sesiones programadas','No scheduled sessions','Aucune séance programmée','Sem sessões agendadas'],
  ['Sin sesiones confirmadas para hoy','No confirmed sessions for today','Aucune séance confirmée pour aujourd’hui','Sem sessões confirmadas para hoje'],
  ['No hay sesiones confirmadas para hoy.','There are no confirmed sessions for today.','Aucune séance n’est confirmée pour aujourd’hui.','Não há sessões confirmadas para hoje.'],
  ['Sin clientes asignados','No assigned clients','Aucun client attribué','Sem clientes atribuídos'],
  ['Sin entrenamientos recientes','No recent training sessions','Aucun entraînement récent','Sem treinos recentes'],
  ['Sin carga registrada','No recorded load','Aucune charge enregistrée','Sem carga registada'],
  ['Sin señales prioritarias','No priority signals','Aucun signal prioritaire','Sem sinais prioritários'],
  ['Sin comparación','No comparison','Aucune comparaison','Sem comparação'],
  ['Sin comparación suficiente','Insufficient comparison','Comparaison insuffisante','Comparação insuficiente'],
  ['Sin dato comparable','No comparable data','Aucune donnée comparable','Sem dados comparáveis'],
  ['Sin evaluación comparable','No comparable assessment','Aucune évaluation comparable','Sem avaliação comparável'],
  ['Sin evaluación','No assessment','Aucune évaluation','Sem avaliação'],
  ['Sin evaluación confirmada','No confirmed assessment','Aucune évaluation confirmée','Sem avaliação confirmada'],
  ['Sin registro confirmado','No confirmed record','Aucun enregistrement confirmé','Sem registo confirmado'],
  ['Sin contexto reciente','No recent context','Aucun contexte récent','Sem contexto recente'],
  ['Contexto disponible','Context available','Contexte disponible','Contexto disponível'],
  ['Datos recientes','Recent data','Données récentes','Dados recentes'],
  ['Solo información confirmada','Confirmed information only','Informations confirmées uniquement','Apenas informação confirmada'],
  ['Solo datos confirmados','Confirmed data only','Données confirmées uniquement','Apenas dados confirmados'],
  ['Revisión pendiente','Review pending','Vérification en attente','Revisão pendente'],
  ['Seguimiento pendiente','Follow-up pending','Suivi en attente','Acompanhamento pendente'],
  ['Seguimiento por revisar','Follow-up to review','Suivi à vérifier','Acompanhamento por rever'],
  ['Seguimiento al día','Follow-up up to date','Suivi à jour','Acompanhamento em dia'],
  ['Seguimiento disponible','Follow-up available','Suivi disponible','Acompanhamento disponível'],
  ['Prioridades de hoy','Today’s priorities','Priorités du jour','Prioridades de hoje'],
  ['Atención prioritaria','Priority attention','Attention prioritaire','Atenção prioritária'],
  ['Requiere revisión','Review required','Vérification requise','Requer revisão'],
  ['Requiere contexto','Context required','Contexte requis','Requer contexto'],
  ['Propuestas por revisar','Proposals to review','Propositions à vérifier','Propostas por rever'],
  ['Propuestas pendientes','Pending proposals','Propositions en attente','Propostas pendentes'],
  ['Conflictos por resolver','Conflicts to resolve','Conflits à résoudre','Conflitos por resolver'],
  ['Tu siguiente paso','Your next step','Votre prochaine étape','O seu próximo passo'],
  ['Tu plan','Your plan','Votre plan','O seu plano'],
  ['Tu planificación','Your planning','Votre planification','O seu planeamento'],
  ['Tu próxima sesión','Your next session','Votre prochaine séance','A sua próxima sessão'],
  ['Tu progreso confirmado','Your confirmed progress','Votre progression confirmée','O seu progresso confirmado'],
  ['Tu día IBERFIT','Your IBERFIT day','Votre journée IBERFIT','O seu dia IBERFIT'],
  ['Tu seguimiento ya está actualizado','Your follow-up is now up to date','Votre suivi est maintenant à jour','O seu acompanhamento está atualizado'],
  ['Tu progreso está guardado','Your progress is saved','Votre progression est enregistrée','O seu progresso está guardado'],
  ['Entrenamiento de hoy','Today’s training','Entraînement du jour','Treino de hoje'],
  ['Entrenamiento listo para hoy','Training ready for today','Entraînement prêt pour aujourd’hui','Treino pronto para hoje'],
  ['Sesión confirmada para hoy','Session confirmed for today','Séance confirmée pour aujourd’hui','Sessão confirmada para hoje'],
  ['Evaluación IRI','IRI Assessment','Évaluation IRI','Avaliação IRI'],
  ['Diagnóstico IRI','IRI Assessment','Diagnostic IRI','Diagnóstico IRI'],
  ['Perfil IRI por dominios','IRI profile by domain','Profil IRI par domaine','Perfil IRI por domínios'],
  ['Evaluación inicial','Initial assessment','Évaluation initiale','Avaliação inicial'],
  ['Evaluación confirmada','Assessment confirmed','Évaluation confirmée','Avaliação confirmada'],
  ['IRI completado · 7 etapas','IRI completed · 7 stages','IRI terminé · 7 étapes','IRI concluído · 7 etapas'],
  ['IRI en preparación','IRI in preparation','IRI en préparation','IRI em preparação'],
  ['IRI no iniciado','IRI not started','IRI non démarré','IRI não iniciado'],
  ['Acceso configurado','Access configured','Accès configuré','Acesso configurado'],
  ['Acceso pendiente','Access pending','Accès en attente','Acesso pendente'],
  ['Objetivo pendiente de registrar','Goal not yet recorded','Objectif à enregistrer','Objetivo por registar'],
  ['Frecuencia pendiente','Frequency pending','Fréquence en attente','Frequência pendente'],
  ['Expediente activo','Active client record','Dossier client actif','Processo ativo'],
  ['Abrir expediente','Open client record','Ouvrir le dossier client','Abrir processo'],
  ['Revisar expediente','Review client record','Vérifier le dossier client','Rever processo'],
  ['Ver clientes','View clients','Voir les clients','Ver clientes'],
  ['Revisar cartera de clientes','Review client portfolio','Vérifier le portefeuille clients','Rever carteira de clientes'],
  ['Abrir agenda','Open schedule','Ouvrir l’agenda','Abrir agenda'],
  ['Revisar agenda','Review schedule','Vérifier l’agenda','Rever agenda'],
  ['Ver agenda','View schedule','Voir l’agenda','Ver agenda'],
  ['Registrar bienestar','Record wellbeing','Enregistrer le bien-être','Registar bem-estar'],
  ['Revisar bienestar','Review wellbeing','Vérifier le bien-être','Rever bem-estar'],
  ['Revisar progreso','Review progress','Vérifier la progression','Rever progresso'],
  ['Ver progreso','View progress','Voir la progression','Ver progresso'],
  ['Revisar planificación','Review planning','Vérifier la planification','Rever planeamento'],
  ['Ver planificación','View planning','Voir la planification','Ver planeamento'],
  ['Revisar seguimiento','Review follow-up','Vérifier le suivi','Rever acompanhamento'],
  ['Revisar datos','Review data','Vérifier les données','Rever dados'],
  ['Revisar IRI','Review IRI','Vérifier l’IRI','Rever IRI'],
  ['Abrir sesiones','Open sessions','Ouvrir les séances','Abrir sessões'],
  ['Consultar informes','View reports','Consulter les rapports','Consultar relatórios'],
  ['Abrir Mensajes','Open Messages','Ouvrir les messages','Abrir Mensagens'],
  ['Revisar Dispositivos','Review Devices','Vérifier les appareils','Rever Dispositivos'],
  ['Crear asignación','Create assignment','Créer une attribution','Criar atribuição'],
  ['Crear tarea','Create task','Créer une tâche','Criar tarefa'],
  ['Guardar plantilla','Save template','Enregistrer le modèle','Guardar modelo'],
  ['Guardar regla','Save rule','Enregistrer la règle','Guardar regra'],
  ['Crear cliente y enviar invitación','Create client and send invitation','Créer le client et envoyer l’invitation','Criar cliente e enviar convite'],
  ['Invitación enviada','Invitation sent','Invitation envoyée','Convite enviado'],
  ['Invitación pendiente','Invitation pending','Invitation en attente','Convite pendente'],
  ['Error de invitación','Invitation error','Erreur d’invitation','Erro no convite'],
  ['Dirección del servicio','Service management','Direction du service','Direção do serviço'],
  ['Dirección de equipo','Team management','Direction de l’équipe','Direção da equipa'],
  ['Indicadores del Coach','Coach indicators','Indicateurs du Coach','Indicadores do Coach'],
  ['Clientes activos','Active clients','Clients actifs','Clientes ativos'],
  ['Sesiones completadas','Completed sessions','Séances terminées','Sessões concluídas'],
  ['Servicio al día','Service up to date','Service à jour','Serviço em dia'],
  ['Sin tareas','No tasks','Aucune tâche','Sem tarefas'],
  ['Sin eventos','No events','Aucun événement','Sem eventos'],
  ['Sin Coaches','No Coaches','Aucun Coach','Sem Coaches'],
  ['Sin asignaciones','No assignments','Aucune attribution','Sem atribuições'],
  ['Motivo de la eliminación','Reason for deletion','Motif de suppression','Motivo da eliminação'],
  ['Mostrar contraseña','Show password','Afficher le mot de passe','Mostrar palavra-passe'],
  ['Ocultar contraseña','Hide password','Masquer le mot de passe','Ocultar palavra-passe'],
  ['Olvidé mi contraseña','I forgot my password','J’ai oublié mon mot de passe','Esqueci-me da palavra-passe'],
  ['Guardar contraseña','Save password','Enregistrer le mot de passe','Guardar palavra-passe'],
  ['Confirmar en este dispositivo','Confirm on this device','Confirmer sur cet appareil','Confirmar neste dispositivo'],
  ['Verifica que eres tú','Verify it’s you','Vérifiez votre identité','Verifique que é você'],
  ['Verificando…','Verifying…','Vérification…','A verificar…'],
  ['Verificar con este dispositivo','Verify with this device','Vérifier avec cet appareil','Verificar com este dispositivo'],
  ['Reintentar verificación','Retry verification','Réessayer la vérification','Tentar novamente a verificação'],
  ['Volver a vincular este dispositivo (recomendado)','Set up this device again (recommended)','Configurer à nouveau cet appareil (recommandé)','Configurar novamente este dispositivo (recomendado)'],
  ['La verificación anterior no respondió. Reintenta la verificación o repara el acceso local. Por seguridad, un dispositivo nuevo solo puede añadirse después de verificar una credencial existente.','The previous verification did not respond. Retry verification or repair local access. For security, a new device can only be added after an existing credential has been verified.','La vérification précédente n’a pas répondu. Réessayez la vérification ou réparez l’accès local. Pour des raisons de sécurité, un nouvel appareil ne peut être ajouté qu’après vérification d’un identifiant existant.','A verificação anterior não respondeu. Tente novamente a verificação ou repare o acesso local. Por segurança, um novo dispositivo só pode ser adicionado depois de uma credencial existente ser verificada.'],
  ['Los dispositivos nuevos se añaden desde una sesión ya verificada. Si pierdes todos tus dispositivos de confianza, IBERFIT debe recuperar el acceso mediante un flujo reforzado.','New devices are added from an already verified session. If you lose all trusted devices, IBERFIT must recover access through a reinforced recovery flow.','Les nouveaux appareils sont ajoutés depuis une session déjà vérifiée. Si vous perdez tous vos appareils de confiance, IBERFIT doit rétablir l’accès via un processus de récupération renforcé.','Novos dispositivos são adicionados a partir de uma sessão já verificada. Se perder todos os dispositivos de confiança, o IBERFIT deve recuperar o acesso através de um fluxo de recuperação reforçado.'],
  ['Usar código por correo (recomendado)','Use email code (recommended)','Utiliser un code par e-mail (recommandé)','Usar código por e-mail (recomendado)'],
  ['Reparar acceso en este dispositivo','Repair access on this device','Réparer l’accès sur cet appareil','Reparar acesso neste dispositivo'],
  ['Reparando los archivos seguros de acceso…','Repairing secure access files…','Réparation des fichiers d’accès sécurisés…','A reparar os ficheiros de acesso seguro…'],
  ['Acceso reparado. Recargando IBERFIT…','Access repaired. Reloading IBERFIT…','Accès réparé. Rechargement d’IBERFIT…','Acesso reparado. A recarregar o IBERFIT…'],
  ['No se pudieron limpiar los archivos temporales de acceso. Puedes usar el código por correo o volver a intentarlo.','Temporary access files could not be cleared. You can use the email code or try again.','Les fichiers temporaires d’accès n’ont pas pu être nettoyés. Vous pouvez utiliser le code par e-mail ou réessayer.','Não foi possível limpar os ficheiros temporários de acesso. Pode usar o código por e-mail ou tentar novamente.'],
  ['La seguridad del dispositivo no respondió a tiempo. Tu sesión sigue protegida: usa “Código por correo” para entrar ahora o vuelve a intentar la verificación del dispositivo.','Device security did not respond in time. Your session is still protected: use “Email code” to sign in now or retry device verification.','La sécurité de l’appareil n’a pas répondu à temps. Votre session reste protégée : utilisez « Code par e-mail » pour vous connecter maintenant ou réessayez la vérification de l’appareil.','A segurança do dispositivo não respondeu a tempo. A sua sessão continua protegida: use “Código por e-mail” para entrar agora ou tente novamente a verificação do dispositivo.'],
  ['La seguridad del dispositivo no respondió a tiempo. Puedes reintentar o reparar los archivos temporales de acceso sin borrar tu cuenta ni tus datos.','Device security did not respond in time. You can retry or repair temporary access files without deleting your account or data.','La sécurité de l’appareil n’a pas répondu à temps. Vous pouvez réessayer ou réparer les fichiers temporaires d’accès sans supprimer votre compte ni vos données.','A segurança do dispositivo não respondeu a tempo. Pode tentar novamente ou reparar os ficheiros temporários de acesso sem apagar a sua conta nem os seus dados.'],
  ['No se completó la verificación del dispositivo. Puedes usar “Código por correo”, volver a intentarlo o configurar este dispositivo.','Device verification was not completed. You can use “Email code”, try again, or set up this device.','La vérification de l’appareil n’a pas été effectuée. Vous pouvez utiliser « Code par e-mail », réessayer ou configurer cet appareil.','A verificação do dispositivo não foi concluída. Pode usar “Código por e-mail”, tentar novamente ou configurar este dispositivo.'],
  ['No se completó la verificación del dispositivo. Puedes reintentar; si este equipo aún no está configurado, usa “Configurar este dispositivo”.','Device verification was not completed. You can retry; if this device is not set up yet, use “Set up this device”.','La vérification de l’appareil n’a pas été effectuée. Vous pouvez réessayer ; si cet appareil n’est pas encore configuré, utilisez « Configurer cet appareil ».','A verificação do dispositivo não foi concluída. Pode tentar novamente; se este dispositivo ainda não estiver configurado, use “Configurar este dispositivo”.'],
  ['No fue posible completar la verificación segura. Puedes usar el código por correo o intentarlo de nuevo.','Secure verification could not be completed. You can use the email code or try again.','La vérification sécurisée n’a pas pu être effectuée. Vous pouvez utiliser le code par e-mail ou réessayer.','Não foi possível concluir a verificação segura. Pode usar o código por e-mail ou tentar novamente.'],
  ['Configurar este dispositivo','Set up this device','Configurer cet appareil','Configurar este dispositivo'],
  ['Abriendo seguridad del dispositivo…','Opening device security…','Ouverture de la sécurité de l’appareil…','A abrir a segurança do dispositivo…'],
  ['Acceso privado','Private access','Accès privé','Acesso privado'],
  ['Entrenamiento personal con criterio','Personal training with purpose','Entraînement personnel avec méthode','Treino pessoal com critério'],
  ['Diagnóstico, planificación, control y seguimiento.','Assessment, planning, control and follow-up.','Évaluation, planification, contrôle et suivi.','Avaliação, planeamento, controlo e acompanhamento.'],
  ['Correo','Email','E-mail','E-mail'],
  ['Recordar correo','Remember email','Mémoriser l’e-mail','Lembrar e-mail'],
  ['Primera vez o no recuerdo mi contraseña','First time here or forgot your password','Première connexion ou mot de passe oublié','Primeiro acesso ou não se lembra da palavra-passe'],
  ['Entrar','Sign in','Se connecter','Entrar'],
  ['Confirmando…','Signing in…','Connexion…','A entrar…'],
  ['Reconectando tu sesión…','Reconnecting your session…','Reconnexion de votre session…','A restabelecer a sua sessão…'],
  ['Restaurando tu sesión segura…','Restoring your secure session…','Restauration de votre session sécurisée…','A restaurar a sua sessão segura…'],
  ['Confirmando identidad y permisos…','Confirming identity and permissions…','Vérification de l’identité et des autorisations…','A confirmar identidade e permissões…'],
  ['El acceso está tardando más de lo esperado. Puedes volver a intentarlo sin recargar la aplicación.','Access is taking longer than expected. You can try again without reloading the app.','L’accès prend plus de temps que prévu. Vous pouvez réessayer sans recharger l’application.','O acesso está a demorar mais do que o esperado. Pode tentar novamente sem recarregar a aplicação.'],
  ['Tu sesión está guardada. Puedes continuar sin bloquear el arranque de IBERFIT.','Your session is saved. You can continue without blocking IBERFIT startup.','Votre session est enregistrée. Vous pouvez continuer sans bloquer le démarrage d’IBERFIT.','A sua sessão está guardada. Pode continuar sem bloquear o arranque do IBERFIT.'],
  ['Tu sesión sigue guardada','Your session is still saved','Votre session est toujours enregistrée','A sua sessão continua guardada'],
  ['No necesitas volver a escribir la contraseña. Reintenta la conexión o usa otra cuenta si lo prefieres.','You do not need to enter your password again. Retry the connection or use another account.','Vous n’avez pas besoin de saisir à nouveau votre mot de passe. Réessayez la connexion ou utilisez un autre compte.','Não precisa de voltar a escrever a palavra-passe. Tente novamente a ligação ou use outra conta.'],
  ['Reintentar acceso','Retry access','Réessayer l’accès','Tentar acesso novamente'],
  ['Entrenamiento personal premium','Premium personal training','Entraînement personnel premium','Treino pessoal premium'],
  ['Un sistema claro para entrenar, medir y progresar.','A clear system to train, measure and progress.','Un système clair pour s’entraîner, mesurer et progresser.','Um sistema claro para treinar, medir e progredir.'],
  ['IBERFIT une diagnóstico, planificación, control de carga y seguimiento en una experiencia continua, dentro y fuera de cada sesión.','IBERFIT brings assessment, planning, load control and follow-up together in one continuous experience, in and out of every session.','IBERFIT réunit évaluation, planification, contrôle de charge et suivi dans une expérience continue, pendant et en dehors de chaque séance.','O IBERFIT reúne avaliação, planeamento, controlo de carga e acompanhamento numa experiência contínua, dentro e fora de cada sessão.'],
  ['Diagnóstico','Assessment','Évaluation','Avaliação'],
  ['Punto de partida medible','A measurable starting point','Un point de départ mesurable','Um ponto de partida mensurável'],
  ['Carga y progresión con criterio','Load and progression with purpose','Charge et progression avec méthode','Carga e progressão com critério'],
  ['Decisiones basadas en tu evolución','Decisions based on your progress','Des décisions fondées sur votre progression','Decisões baseadas na sua evolução'],
  ['Acceso privado · datos protegidos · continuidad entre dispositivos','Private access · protected data · continuity across devices','Accès privé · données protégées · continuité entre appareils','Acesso privado · dados protegidos · continuidade entre dispositivos'],
  ['IBERFIT · entrenamiento personal','IBERFIT · personal training','IBERFIT · entraînement personnel','IBERFIT · treino pessoal'],
  ['Preparando la confirmación segura…','Preparing secure confirmation…','Préparation de la confirmation sécurisée…','A preparar a confirmação segura…'],
  ['Preparando el acceso seguro…','Preparing secure access…','Préparation de l’accès sécurisé…','A preparar o acesso seguro…'],
  ['Abriendo la seguridad de este dispositivo…','Opening this device’s security…','Ouverture de la sécurité de cet appareil…','A abrir a segurança deste dispositivo…'],
  ['Abriendo la configuración segura del dispositivo…','Opening secure device setup…','Ouverture de la configuration sécurisée de l’appareil…','A abrir a configuração segura do dispositivo…'],
  ['Comprobando la verificación segura…','Checking secure verification…','Vérification de la validation sécurisée…','A verificar a validação segura…'],
  ['La verificación segura no recibió respuesta a tiempo. IBERFIT ha liberado el acceso para evitar un bloqueo. Vuelve a vincular este dispositivo (recomendado) o reintenta la verificación.','Secure verification did not respond in time. IBERFIT released the access flow to prevent a lock-up. Set up this device again (recommended) or retry verification.','La vérification sécurisée n’a pas répondu à temps. IBERFIT a libéré le flux d’accès pour éviter un blocage. Configurez à nouveau cet appareil (recommandé) ou réessayez la vérification.','A verificação segura não respondeu a tempo. O IBERFIT libertou o fluxo de acesso para evitar um bloqueio. Configure novamente este dispositivo (recomendado) ou tente novamente a verificação.'],
  ['La configuración segura no recibió respuesta a tiempo. El acceso ya está liberado: inténtalo de nuevo o usa “Reparar acceso en este dispositivo”.','Secure setup did not respond in time. Access has been released: try again or use “Repair access on this device”.','La configuration sécurisée n’a pas répondu à temps. L’accès a été libéré : réessayez ou utilisez « Réparer l’accès sur cet appareil ».','A configuração segura não respondeu a tempo. O acesso já foi libertado: tente novamente ou use “Reparar acesso neste dispositivo”.'],
  ['Configurando…','Setting up…','Configuration…','A configurar…'],
  ['Verificación del dispositivo','Device verification','Vérification de l’appareil','Verificação do dispositivo'],
  ['Protege tu acceso','Protect your access','Protégez votre accès','Proteja o seu acesso'],
  ['Confirma que eres tú','Confirm it’s you','Confirmez votre identité','Confirme que é você'],
  ['Volver y usar otra cuenta','Go back and use another account','Revenir et utiliser un autre compte','Voltar e usar outra conta'],
  ['Acceso privado para clientes y equipo IBERFIT.','Private access for IBERFIT clients and team.','Accès privé pour les clients et l’équipe IBERFIT.','Acesso privado para clientes e equipa IBERFIT.'],
  ['Acceso restringido a las cuentas autorizadas para esta revisión.','Access restricted to accounts authorised for this review.','Accès limité aux comptes autorisés pour cette vérification.','Acesso restrito às contas autorizadas para esta revisão.'],
  ['La sesión perdió autorización. Vuelve a entrar.','The session lost authorisation. Sign in again.','La session a perdu son autorisation. Reconnectez-vous.','A sessão perdeu a autorização. Inicie sessão novamente.'],
  ['No fue posible conectar. Comprueba tu conexión a internet e inténtalo de nuevo.','Could not connect. Check your internet connection and try again.','Connexion impossible. Vérifiez votre connexion Internet et réessayez.','Não foi possível ligar. Verifique a ligação à Internet e tente novamente.'],
  ['Esta cuenta no está autorizada para este acceso.','This account is not authorised for this access.','Ce compte n’est pas autorisé pour cet accès.','Esta conta não está autorizada para este acesso.'],
  ['No fue posible completar la operación. Tu información local permanece protegida.','The operation could not be completed. Your local information remains protected.','Impossible de terminer l’opération. Vos informations locales restent protégées.','Não foi possível concluir a operação. A sua informação local permanece protegida.'],
  ['El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.','The recovery link is invalid or has expired. Request a new one.','Le lien de récupération est invalide ou a expiré. Demandez-en un nouveau.','A ligação de recuperação é inválida ou expirou. Solicite uma nova.'],
  ['La contraseña debe tener entre 8 y 1024 caracteres.','The password must contain between 8 and 1024 characters.','Le mot de passe doit contenir entre 8 et 1024 caractères.','A palavra-passe deve ter entre 8 e 1024 caracteres.'],
  ['Las contraseñas no coinciden.','Passwords do not match.','Les mots de passe ne correspondent pas.','As palavras-passe não coincidem.'],
  ['Contraseña actualizada. Ya puedes entrar con la contraseña nueva.','Password updated. You can now sign in with the new password.','Mot de passe mis à jour. Vous pouvez maintenant vous connecter avec le nouveau mot de passe.','Palavra-passe atualizada. Já pode iniciar sessão com a nova palavra-passe.'],
  ['Sesión recuperada desde este dispositivo.','Session recovered from this device.','Session récupérée depuis cet appareil.','Sessão recuperada deste dispositivo.'],
  ['Borrador recuperado de forma segura.','Draft recovered safely.','Brouillon récupéré en toute sécurité.','Rascunho recuperado em segurança.'],
  ['Sesión cerrada de forma segura.','Signed out safely.','Session fermée en toute sécurité.','Sessão terminada em segurança.'],
  ['Operación no encontrada','Operation not found','Opération introuvable','Operação não encontrada'],
  ['Revisa los campos obligatorios','Review the required fields','Vérifiez les champs obligatoires','Reveja os campos obrigatórios'],
  ['Completa los datos obligatorios del ejercicio','Complete the required exercise details','Complétez les données obligatoires de l’exercice','Preencha os dados obrigatórios do exercício'],
  ['Creando ejercicio y actualizando el catálogo…','Creating exercise and updating the catalogue…','Création de l’exercice et mise à jour du catalogue…','A criar exercício e a atualizar o catálogo…'],
  ['Ejercicio creado y disponible en el catálogo y en el constructor de sesiones.','Exercise created and available in the catalogue and session builder.','Exercice créé et disponible dans le catalogue et le générateur de séances.','Exercício criado e disponível no catálogo e no construtor de sessões.'],
  ['Ya existe un ejercicio activo con ese nombre. Usa el existente o elige un nombre que lo diferencie.','An active exercise with that name already exists. Use it or choose a distinct name.','Un exercice actif porte déjà ce nom. Utilisez-le ou choisissez un nom différent.','Já existe um exercício ativo com esse nome. Utilize-o ou escolha um nome diferente.'],
  ['Revisa los datos del ejercicio personalizado antes de guardarlo.','Review the custom exercise details before saving.','Vérifiez les données de l’exercice personnalisé avant de l’enregistrer.','Reveja os dados do exercício personalizado antes de guardar.'],
  ['Serie registrada','Set recorded','Série enregistrée','Série registada'],
  ['Serie confirmada','Set confirmed','Série confirmée','Série confirmada'],
  ['Ejercicio actual','Current exercise','Exercice actuel','Exercício atual'],
  ['Finalizar ejercicio','Finish exercise','Terminer l’exercice','Terminar exercício'],
  ['Mismo ejercicio','Same exercise','Même exercice','Mesmo exercício'],
  ['Continuar al cierre','Continue to wrap-up','Continuer vers la clôture','Continuar para o fecho'],
  ['Última serie completada','Last completed set','Dernière série terminée','Última série concluída'],
  ['Continuar al siguiente','Continue to next','Passer au suivant','Continuar para o seguinte'],
  ['Siguiente ejercicio','Next exercise','Exercice suivant','Exercício seguinte'],
  ['Próxima serie','Next set','Prochaine série','Próxima série'],
  ['Próximo objetivo','Next target','Prochain objectif','Próximo objetivo'],
  ['Preparación de la próxima serie','Next set preparation','Préparation de la prochaine série','Preparação da próxima série'],
  ['Preparación del siguiente ejercicio','Next exercise preparation','Préparation de l’exercice suivant','Preparação do exercício seguinte'],
  ['Última referencia confirmada del ejercicio','Last confirmed exercise reference','Dernière référence confirmée de l’exercice','Última referência confirmada do exercício'],
  ['Sin cambios pendientes','No pending changes','Aucune modification en attente','Sem alterações pendentes'],
  ['Pendiente de sincronización','Pending sync','Synchronisation en attente','Sincronização pendente'],
  ['Requiere revisión de sincronización','Sync review required','Vérification de synchronisation requise','Requer revisão da sincronização'],
  ['Guardado localmente','Saved locally','Enregistré localement','Guardado localmente'],
  ['Duración prevista','Planned duration','Durée prévue','Duração prevista'],
  ['Sesión programada','Scheduled session','Séance programmée','Sessão agendada'],
  ['Confirma el contexto y empieza a trabajar con el cliente.','Confirm the context and start working with the client.','Confirmez le contexte et commencez à travailler avec le client.','Confirme o contexto e comece a trabalhar com o cliente.'],
  ['Revisa el plan y empieza cuando estés preparado.','Review the plan and start when you are ready.','Vérifiez le plan et commencez lorsque vous êtes prêt.','Reveja o plano e comece quando estiver preparado.'],
  ['Iniciar entrenamiento','Start training','Démarrer l’entraînement','Iniciar treino'],
  ['Iniciar sesión','Start session','Démarrer la séance','Iniciar sessão'],
  ['La sesión fue cancelada.','The session was cancelled.','La séance a été annulée.','A sessão foi cancelada.'],
  ['Cancelación confirmada.','Cancellation confirmed.','Annulation confirmée.','Cancelamento confirmado.'],
  ['Los resultados y tu feedback quedaron confirmados.','Your results and feedback were confirmed.','Vos résultats et votre feedback ont été confirmés.','Os seus resultados e feedback foram confirmados.'],
  ['Continuar ahora','Continue now','Continuer maintenant','Continuar agora'],
  ['En entrenamiento','Training in progress','En cours d’entraînement','Em treino'],
  ['Cliente 360','Client 360','Client 360','Cliente 360'],
  ['Abrir Cliente 360','Open Client 360','Ouvrir Client 360','Abrir Cliente 360'],
  ['Ver mi progreso','View my progress','Voir ma progression','Ver o meu progresso'],
  ['Tu seguimiento ya puede continuar desde Progreso.','Your follow-up can now continue from Progress.','Votre suivi peut maintenant se poursuivre depuis Progression.','O seu acompanhamento pode agora continuar a partir de Progresso.'],
  ['El seguimiento del cliente ya puede continuar desde Cliente 360.','Client follow-up can now continue in Client 360.','Le suivi du client peut désormais se poursuivre dans Client 360.','O acompanhamento do cliente pode agora continuar no Cliente 360.'],
  ['Ahora','Now','Maintenant','Agora'],
  ['Siguiente decisión','Next decision','Prochaine décision','Próxima decisão'],
  ['Siguiente decisión del Coach','Next Coach decision','Prochaine décision du Coach','Próxima decisão do Coach'],
  ['Por qué ahora','Why now','Pourquoi maintenant','Porquê agora'],
  ['Datos confirmados disponibles','Confirmed data available','Données confirmées disponibles','Dados confirmados disponíveis'],
  ['Revisa tu evolución confirmada y continúa desde los accesos disponibles.','Review your confirmed progress and continue from the available shortcuts.','Consultez votre progression confirmée et continuez depuis les raccourcis disponibles.','Reveja o seu progresso confirmado e continue a partir dos atalhos disponíveis.'],
  ['La vista reúne evidencia confirmada para decidir el siguiente paso sin automatizar el criterio.','This view brings confirmed evidence together to decide the next step without automating judgement.','Cette vue rassemble les éléments confirmés pour décider de l’étape suivante sans automatiser le jugement.','Esta vista reúne evidência confirmada para decidir o próximo passo sem automatizar o critério.'],
  ['Tu semana de un vistazo','Your week at a glance','Votre semaine en un coup d’œil','A sua semana em resumo'],
  ['Resumen de tu planificación','Your planning summary','Résumé de votre planification','Resumo do seu planeamento'],
  ['Planificación pendiente','Planning pending','Planification en attente','Planeamento pendente'],
  ['Cada sesión mantiene su modalidad real, permisos de ejecución y contexto. IBERFIT no convierte una sesión supervisada en autónoma.','Each session keeps its actual delivery mode, execution permissions and context. IBERFIT does not turn a supervised session into an autonomous one.','Chaque séance conserve son mode réel, ses autorisations d’exécution et son contexte. IBERFIT ne transforme pas une séance supervisée en séance autonome.','Cada sessão mantém a sua modalidade real, permissões de execução e contexto. A IBERFIT não transforma uma sessão supervisionada numa sessão autónoma.'],
  ['Con Coach','With Coach','Avec le Coach','Com Coach'],
  ['En app','In app','Dans l’app','Na app'],
  ['sesiones','sessions','séances','sessões'],
  ['supervisadas','supervised','supervisées','supervisionadas'],
  ['Resumen Cliente 360','Client 360 summary','Résumé Client 360','Resumo Cliente 360'],
  ['Evolución reciente','Recent progress','Évolution récente','Evolução recente'],
  ['Últimos 90 días','Last 90 days','90 derniers jours','Últimos 90 dias'],
  ['Recuperación y bienestar','Recovery and wellbeing','Récupération et bien-être','Recuperação e bem-estar'],
  ['Actividad de dispositivos','Device activity','Activité des appareils','Atividade de dispositivos'],
  ['No se inventan datos ausentes','Missing data is never invented','Les données absentes ne sont jamais inventées','Os dados em falta nunca são inventados'],
  ['Construyendo tu línea base','Building your baseline','Construction de votre référence','A construir a sua linha de base'],
  ['Ritmo de entrenamiento','Training rhythm','Rythme d’entraînement','Ritmo de treino'],
  ['Constancia · 28 días','Consistency · 28 days','Régularité · 28 jours','Consistência · 28 dias'],
  ['Cómo estás','How you are','Comment vous allez','Como está'],
  ['Sin registro reciente','No recent record','Aucun enregistrement récent','Sem registo recente'],
  ['Atención','Attention','Attention','Atenção'],
  ['Cierre post-sesión','Post-session wrap-up','Clôture après séance','Fecho pós-sessão'],
  ['Cierra el entrenamiento con contexto','Wrap up training with context','Terminez l’entraînement avec le contexte','Feche o treino com contexto'],
  ['Guardar cierre y continuar','Save wrap-up and continue','Enregistrer la clôture et continuer','Guardar fecho e continuar'],
  ['Continuidad después de la sesión','Continuity after the session','Continuité après la séance','Continuidade após a sessão'],
  ['Sincronización por actualizar','Sync needs updating','Synchronisation à mettre à jour','Sincronização por atualizar'],
  ['Guardado en este dispositivo · pendiente de sincronización.','Saved on this device · pending sync.','Enregistré sur cet appareil · synchronisation en attente.','Guardado neste dispositivo · sincronização pendente.'],
  ['Sincronizar ahora','Sync now','Synchroniser maintenant','Sincronizar agora'],
  ['No fue posible sincronizar ahora. Tu progreso sigue guardado en este dispositivo.','Could not sync now. Your progress remains saved on this device.','Impossible de synchroniser maintenant. Votre progression reste enregistrée sur cet appareil.','Não foi possível sincronizar agora. O seu progresso continua guardado neste dispositivo.'],
  ['Sin conexión. Tu progreso sigue guardado en este dispositivo; vuelve a sincronizar cuando recuperes internet.','No connection. Your progress remains saved on this device; sync again when you are back online.','Pas de connexion. Votre progression reste enregistrée sur cet appareil ; synchronisez à nouveau lorsque la connexion Internet revient.','Sem ligação. O seu progresso continua guardado neste dispositivo; volte a sincronizar quando recuperar a internet.'],
  ['Sincronización completada. Los cambios pendientes quedaron confirmados.','Sync complete. Pending changes were confirmed.','Synchronisation terminée. Les modifications en attente ont été confirmées.','Sincronização concluída. As alterações pendentes foram confirmadas.'],
  ['La sincronización detectó una versión más reciente. Tu progreso local está protegido y requiere revisión.','Sync detected a newer version. Your local progress is protected and requires review.','La synchronisation a détecté une version plus récente. Votre progression locale est protégée et nécessite une vérification.','A sincronização detetou uma versão mais recente. O seu progresso local está protegido e requer revisão.'],
  ['El último cambio no pudo confirmarse. Tu progreso local se conserva para revisión.','The latest change could not be confirmed. Your local progress is retained for review.','La dernière modification n’a pas pu être confirmée. Votre progression locale est conservée pour vérification.','A última alteração não pôde ser confirmada. O seu progresso local é mantido para revisão.'],
  ['Aún hay cambios pendientes de su próximo reintento. Tu progreso sigue guardado de forma segura.','Some changes are still waiting for their next retry. Your progress remains safely saved.','Certaines modifications attendent encore leur prochaine tentative. Votre progression reste enregistrée en toute sécurité.','Ainda há alterações pendentes para a próxima tentativa. O seu progresso continua guardado em segurança.'],
  ['Aún quedan cambios por sincronizar. Tu progreso local sigue protegido.','There are still changes to sync. Your local progress remains protected.','Il reste des modifications à synchroniser. Votre progression locale reste protégée.','Ainda há alterações por sincronizar. O seu progresso local continua protegido.'],
  ['La sincronización no pudo confirmar todos los cambios todavía. Tu progreso sigue guardado en este dispositivo.','Sync could not confirm all changes yet. Your progress remains saved on this device.','La synchronisation n’a pas encore pu confirmer toutes les modifications. Votre progression reste enregistrée sur cet appareil.','A sincronização ainda não conseguiu confirmar todas as alterações. O seu progresso continua guardado neste dispositivo.'],
  ['Sincronización en curso','Sync in progress','Synchronisation en cours','Sincronização em curso'],
  ['No hay cambios pendientes para sincronizar','No pending changes to sync','Aucune modification en attente à synchroniser','Não há alterações pendentes para sincronizar'],
  ['Datos de actividad disponibles','Activity data available','Données d’activité disponibles','Dados de atividade disponíveis'],
  ['Resumen de hoy del cliente','Client’s summary for today','Résumé du client pour aujourd’hui','Resumo de hoje do cliente'],
  ['Entrenamiento, constancia y contexto','Training, consistency and context','Entraînement, régularité et contexte','Treino, consistência e contexto'],
  ['No hay sesiones planificadas o confirmadas para calcular constancia.','There are no planned or confirmed sessions to calculate consistency.','Aucune séance planifiée ou confirmée ne permet de calculer la régularité.','Não há sessões planeadas ou confirmadas para calcular a consistência.'],
  ['No hay una próxima cita confirmada. Cuando se confirme, aparecerá aquí.','There is no confirmed upcoming appointment. Once confirmed, it will appear here.','Aucun prochain rendez-vous n’est confirmé. Il apparaîtra ici une fois confirmé.','Não há uma próxima consulta confirmada. Quando for confirmada, aparecerá aqui.'],
  ['No hay señales prioritarias en los datos confirmados disponibles.','There are no priority signals in the available confirmed data.','Aucun signal prioritaire n’apparaît dans les données confirmées disponibles.','Não há sinais prioritários nos dados confirmados disponíveis.'],
  ['Todo al día','All up to date','Tout est à jour','Tudo em dia'],
  ['No hay acciones prioritarias pendientes en este momento.','There are no priority actions pending right now.','Aucune action prioritaire n’est en attente pour le moment.','Não há ações prioritárias pendentes neste momento.'],
  ['Mantener el seguimiento previsto.','Keep the planned follow-up.','Maintenir le suivi prévu.','Manter o acompanhamento previsto.'],
  ['Todavía no hay actividad administrativa.','There is no administrative activity yet.','Il n’y a pas encore d’activité administrative.','Ainda não há atividade administrativa.'],
  ['No hay perfiles de Coach visibles.','There are no visible Coach profiles.','Aucun profil Coach n’est visible.','Não há perfis de Coach visíveis.'],
  ['No hay relaciones Coach–Cliente registradas.','There are no recorded Coach–Client relationships.','Aucune relation Coach–Client n’est enregistrée.','Não há relações Coach–Cliente registadas.'],
  ['La capacidad del equipo aparecerá aquí cuando exista información.','Team capacity will appear here when data is available.','La capacité de l’équipe apparaîtra ici lorsque des données seront disponibles.','A capacidade da equipa aparecerá aqui quando houver informação.'],
  ['Consulta el perfil operativo de cada Coach, su cartera, carga y entrenamientos desde una sola vista.','View each Coach’s operational profile, client portfolio, workload and training from one place.','Consultez le profil opérationnel de chaque Coach, son portefeuille, sa charge et ses entraînements depuis une seule vue.','Consulte o perfil operacional de cada Coach, a sua carteira, carga e treinos numa única vista.'],
  ['Una única vista para decidir qué necesita atención en clientes, equipo y operación.','One view to decide what needs attention across clients, team and operations.','Une seule vue pour décider ce qui nécessite une attention côté clients, équipe et opérations.','Uma única vista para decidir o que requer atenção em clientes, equipa e operação.'],
]);

const LANG_INDEX=Object.freeze({en:1,fr:2,pt:3});
const EXACT=new Map(ROWS.map((row)=>[row[0],Object.freeze({en:row[1],fr:row[2],pt:row[3]})]));
const ATTRIBUTES=Object.freeze(['placeholder','title','aria-label','aria-description']);
const SKIP_SELECTOR='script,style,noscript,code,pre,textarea,[contenteditable="true"],[data-i18n-skip],[data-m26-user-content]';
const INSTALLED=new WeakMap();

function selectedLanguage(value=getIberfitLanguage()){
  const language=String(value||'').trim().toLowerCase();
  return Object.hasOwn(LANG_INDEX,language)?language:'es';
}
function translateExact(value,language){
  if(language==='es')return value;
  return EXACT.get(value)?.[language]??value;
}
function translateComposable(value,language){
  const exact=translateExact(value,language);
  if(exact!==value||language==='es')return exact;
  const rules=[
    [/^Siguiente paso:\s*(.+)$/u,{en:'Next step: ',fr:'Prochaine étape : ',pt:'Próximo passo: '}],
    [/^Revisar\s+(.+)$/u,{en:'Review ',fr:'Vérifier ',pt:'Rever '}],
    [/^Abrir\s+(.+)$/u,{en:'Open ',fr:'Ouvrir ',pt:'Abrir '}],
    [/^Ver\s+(.+)$/u,{en:'View ',fr:'Voir ',pt:'Ver '}],
    [/^Crear\s+(.+)$/u,{en:'Create ',fr:'Créer ',pt:'Criar '}],
    [/^Guardar\s+(.+)$/u,{en:'Save ',fr:'Enregistrer ',pt:'Guardar '}],
    [/^Sin\s+(.+)$/u,{en:'No ',fr:'Aucun ',pt:'Sem '}],
  ];
  for(const [pattern,prefix] of rules){
    const match=value.match(pattern);
    if(!match)continue;
    const translatedTail=translateExact(match[1],language);
    if(translatedTail!==match[1])return `${prefix[language]}${translatedTail}`;
  }
  let match=value.match(/^(\d+) de (\d+) etapas completadas$/u);
  if(match){
    if(language==='en')return `${match[1]} of ${match[2]} stages completed`;
    if(language==='fr')return `${match[1]} sur ${match[2]} étapes terminées`;
    return `${match[1]} de ${match[2]} etapas concluídas`;
  }
  match=value.match(/^Últimos (\d+) días$/u);
  if(match){
    if(language==='en')return `Last ${match[1]} days`;
    if(language==='fr')return `${match[1]} derniers jours`;
    return `Últimos ${match[1]} dias`;
  }
  return value;
}
export function iberfitSurfaceTranslate(value,{language=getIberfitLanguage()}={}){
  const source=String(value??'');
  const lang=selectedLanguage(language);
  if(lang==='es'||!source.trim())return source;
  const leading=source.match(/^\s*/u)?.[0]||'';
  const trailing=source.match(/\s*$/u)?.[0]||'';
  const core=source.slice(leading.length,source.length-trailing.length);
  const exactOrExtra=iberfitExtraSurfaceTranslate(core,{language:lang});
  const composed=exactOrExtra!==core?exactOrExtra:translateComposable(core,lang);
  const translated=composed===core
    ?iberfitDynamicSurfaceTranslate(core,{language:lang,translatePart:(part)=>{
      const extraPart=iberfitExtraSurfaceTranslate(part,{language:lang});
      return extraPart!==part?extraPart:translateComposable(part,lang);
    }})
    :composed;
  return `${leading}${translated}${trailing}`;
}
function skipped(node){
  const element=node?.nodeType===1?node:node?.parentElement;
  return Boolean(element?.closest?.(SKIP_SELECTOR));
}
function translateTextNode(node,language){
  if(!node||node.nodeType!==3||skipped(node))return false;
  const next=iberfitSurfaceTranslate(node.nodeValue,{language});
  if(next===node.nodeValue)return false;
  node.nodeValue=next;
  return true;
}
function translateElementAttributes(element,language){
  if(!element?.getAttribute||skipped(element))return 0;
  let count=0;
  for(const attribute of ATTRIBUTES){
    if(!element.hasAttribute?.(attribute))continue;
    const current=element.getAttribute(attribute);
    const next=iberfitSurfaceTranslate(current,{language});
    if(next!==current){element.setAttribute(attribute,next);count+=1;}
  }
  return count;
}
function walk(root,language){
  if(!root)return 0;
  let count=0;
  if(root.nodeType===3)return translateTextNode(root,language)?1:0;
  if(root.nodeType===1)count+=translateElementAttributes(root,language);
  const documentLike=root.ownerDocument||globalThis.document;
  const walker=documentLike?.createTreeWalker?.(root,0x5); // SHOW_ELEMENT | SHOW_TEXT
  if(!walker)return count;
  let node=walker.nextNode();
  while(node){
    if(node.nodeType===3)count+=translateTextNode(node,language)?1:0;
    else if(node.nodeType===1)count+=translateElementAttributes(node,language);
    node=walker.nextNode();
  }
  return count;
}
export function applyIberfitSurfaceTranslations(root,{language=getIberfitLanguage()}={}){
  return walk(root,selectedLanguage(language));
}
export function installIberfitSurfaceI18n(root){
  if(!root?.ownerDocument||INSTALLED.has(root))return INSTALLED.get(root)||null;
  const apply=()=>applyIberfitSurfaceTranslations(root);
  const MutationObserverLike=root.ownerDocument?.defaultView?.MutationObserver||globalThis.MutationObserver;
  const observer=typeof MutationObserverLike==='function'?new MutationObserverLike((records)=>{
    const language=selectedLanguage();
    if(language==='es')return;
    for(const record of records){
      for(const node of record.addedNodes||[])walk(node,language);
      if(record.type==='attributes')translateElementAttributes(record.target,language);
    }
  }):null;
  observer?.observe?.(root,{subtree:true,childList:true,attributes:true,attributeFilter:[...ATTRIBUTES]});
  const state=Object.freeze({apply,disconnect:()=>{observer?.disconnect?.();INSTALLED.delete(root);}});
  INSTALLED.set(root,state);
  apply();
  return state;
}
export function iberfitSurfaceTranslationCoverage(){
  const languages=['en','fr','pt'];
  return Object.freeze(languages.map((language)=>{
    const missing=ROWS.filter((row)=>!String(row[LANG_INDEX[language]]||'').trim()).map((row)=>row[0]);
    return Object.freeze({language,total:ROWS.length,translated:ROWS.length-missing.length,missing:Object.freeze(missing),complete:missing.length===0});
  }));
}
export function iberfitSurfaceSpanishCatalog(){return Object.freeze(ROWS.map((row)=>row[0]));}
