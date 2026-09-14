# Auditoria vídeo × TEC — Dataprev 2026

## Conclusão executiva

Pelo critério rígido que você definiu — todo tópico do edital e todo tópico relevante das questões FGV/TEC precisa aparecer em uma explicação de vídeo — a rota **ainda não está 100% fechada**. Ela é suficiente para começar os cadernos TEC e cobre a maior parte do núcleo, mas não vou declarar como cobertos assuntos que só aparecem nos comentários das questões ou de forma incidental.

Na auditoria das específicas, 49/70 segmentos foram validados como explicativos, 13/70 ficaram parciais e 8/70 foram validados manualmente. Portanto, a rota é boa como teoria + aplicação, mas deve ser usada em ciclo:

> vídeo → questões FGV no TEC → classificação do erro → retorno ao trecho/complemento → novo bloco de questões.

Foi acrescentado o segmento **E71 — Java EE: introdução e questões** (EJB, Servlets, JSP, JDBC/JMS/JTA e mensageria), porque a introdução histórica anterior não cobria esse conjunto.

## Específicas — nível de segurança

### Pode ir direto ao TEC depois do vídeo

Java básico e OO (E01/E04), JavaScript e HTML (E02/E06), SOA/Web Services/REST (E03), SQL básico (E11), APF (E16), testes (E17), requisitos (E18), DevOps/CI-CD (E19), GoF (E20), Scrum/XP (E05), XML/XSLT/JSON (E54/E15), BI/DW/ETL/OLAP (E08), BPMN (E13), Clean Code (E25), React (E41), Git (E68), Kubernetes/contêineres (E69) e TLS/HTTPS (E70).

Nesses blocos, a aula apresenta conceitos e exemplos/questões. Isso é suficiente para iniciar o caderno, não para encerrar o estudo.

### Vídeo + complemento curto antes ou durante o TEC

| Tema | Segmentos | Motivo |
|---|---|---|
| Segurança aplicada | E14, E23, E24 | E14 é forte para o núcleo; X.800 e ISO 27002 exigem leitura das definições/controles e atenção às alternativas literais. |
| COBIT/ITIL | E12, E51 | Aulas dão visão geral; o TEC cobra princípios, componentes, práticas, objetivos e termos exatos. |
| Banco de dados | E10, E11, E50, E65, E67 | A base está boa, mas álgebra relacional, ANSI/SPARC, mapeamento ER, views/triggers, locks/isolamento e tuning podem não aparecer na aula. |
| Java corporativo | E27–E29, E59–E60 | Aulas cobrem plataforma, JSF/JPA/Hibernate/Spring; JMS/JTA/EJB/Servlets e detalhes de ciclo/escopo precisam ser conferidos nas questões. |
| APIs | E35–E36 | REST/gRPC/GraphQL e OpenAPI são introduzidos, mas a prova pode cobrar propriedades e diferenças específicas. |
| Mensageria e distribuídos | E37–E39 | RabbitMQ e Saga/2PC ficaram parciais na auditoria; faça questões imediatamente e complemente se errar. |
| Frontend/mobile/UX | E28, E30–E32, E42–E46, E55–E56 | Cobertura conceitual suficiente para iniciar; frameworks, acessibilidade, SSD e PWA têm recortes curtos ou legendas imperfeitas. |
| IA/Big Data | E07, E47–E49 | Diferencia Big Data, KDD, IA e GenAI; complete algoritmos, métricas e governança conforme os erros. |

### Não trate como fonte única

E53 (revisão de véspera) serve para fechamento, não para aprender o assunto do zero. E27 é principalmente histórico/nomenclatura de Java EE/Jakarta EE. E31 é fixação por questões, não substitui a explicação de E30.

## Lacunas mais relevantes para as específicas

Ainda falta inserir e validar vídeos específicos para os seguintes tópicos de banco de dados: álgebra relacional, arquitetura ANSI/SPARC, mapeamento ER-relacional, views materializadas, triggers, transações/locks/isolamento, catálogo/dicionário e otimização. Eles não podem ser considerados cobertos apenas porque existem cards ou questões no TEC.

Também não há uma aula única suficientemente profunda para todo o conjunto Java EE (EJB, Servlets, JSP, JMS e JTA), nem para todas as normas de segurança. A rota cobre o mapa, mas não substitui o detalhamento das questões.

## Conhecimentos gerais

Os vídeos de Português, RLM, Inglês e legislação são úteis como revisão e orientação, mas a auditoria de legendas marcou vários módulos como não validados ou parciais. Para gerais, use o caderno TEC como diagnóstico mais cedo: faça 10–15 questões após cada módulo e só assista complemento nos pontos errados. Não presuma que uma aula curta de legislação ou gramática cubra todas as exceções da FGV.

## Regra prática de decisão

- **≥85% no caderno FGV:** avance; mantenha apenas revisão dos erros.
- **70–84%:** a aula serviu de base; revise o trecho e os comentários das questões erradas.
- **<70%:** não basta repetir questões; procure complemento teórico específico do erro e refaça um bloco novo.
- **Erro de detalhe/norma:** registre no Anki ou caderno de erros, mesmo com percentual alto.

Em resumo: a seleção é adequada e coesa para aprender e iniciar o treinamento, especialmente nas específicas de maior peso, mas a aprovação dependerá do ciclo de questões e da correção das lacunas — não de assistir todos os vídeos passivamente.
