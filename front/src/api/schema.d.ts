// GERADO por tools/api-types.mjs a partir de src/api/openapi.snapshot.yaml — NÃO EDITE À MÃO.
// Atualize com: npm run api:sync && npm run api:types

export interface paths {
    "/__debug": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Diagnóstico (admin): últimas requisições, filas, flags */
        get: operations["get_debug"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accessibility/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado e downloads (URLs assinadas) de um arquivo de acessibilidade. Requer `ff_accessibility`. */
        get: operations["get_accessibility_assets_assetId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accessibility/assets/{assetId}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revisão humana da audiodescrição (aprovar, com edições opcionais); só então gera a faixa narrada e o VTT de descrições. Requer `ff_accessibility`. */
        post: operations["post_accessibility_assets_assetId_review"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accessibility/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estilos de legenda acessíveis com contraste medido (mínimo 4,5:1), idiomas e retenção. Requer `ff_accessibility`. */
        get: operations["get_accessibility_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accessibility/transcripts/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confere a assinatura de um SRT/VTT/TXT exportado. Requer `ff_accessibility`. */
        post: operations["post_accessibility_transcripts_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/analytics/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Exporta eventos pseudonimizados e aplica eliminações */
        post: operations["post_admin_analytics_export"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/analytics/freshness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Frescor do warehouse (SLA) */
        get: operations["get_admin_analytics_freshness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/analytics/taxonomy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Taxonomia versionada de eventos */
        get: operations["get_admin_analytics_taxonomy"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/attribution/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Receita por canal (6 modelos) conciliada com transações e Stripe */
        get: operations["get_admin_attribution_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Trilha de auditoria */
        get: operations["get_admin_audit_logs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/creators/{id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Marca criador verificado (taxa reduzida) */
        post: operations["post_admin_creators_id_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/datascience/cohort-ltv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** LTV acumulado por coorte (D0/30/60/90) */
        get: operations["get_admin_datascience_cohort_ltv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/datascience/forecast/ai-cost": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Projeção do custo de IA do mês + alerta de orçamento */
        get: operations["get_admin_datascience_forecast_ai_cost"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/datascience/forecast/revenue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Previsão de receita (tendência × sazonalidade semanal) */
        get: operations["get_admin_datascience_forecast_revenue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/datascience/funnel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Funil de ativação e receita */
        get: operations["get_admin_datascience_funnel"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/datascience/propensity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Maiores propensões (upgrade/créditos) */
        get: operations["get_admin_datascience_propensity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/dlq": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Filas com jobs na DLQ */
        get: operations["get_admin_dlq"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista experimentos */
        get: operations["get_admin_experiments"];
        put?: never;
        /** Cria experimento (draft; A/B, multivariado, holdout, guardrails) */
        post: operations["post_admin_experiments"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalhe do experimento */
        get: operations["get_admin_experiments_key"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edita (bloqueado após o draft, exceto metadados) */
        patch: operations["patch_admin_experiments_key"];
        trace?: never;
    };
    "/admin/experiments/{key}/conclude": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Conclui (ship/keep_control/iterate/inconclusive) */
        post: operations["post_admin_experiments_key_conclude"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/{key}/pause": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pausa experimento */
        post: operations["post_admin_experiments_key_pause"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/{key}/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resultados: significância, correção múltipla, SRM, custo de IA, guardrails */
        get: operations["get_admin_experiments_key_results"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/{key}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inicia experimento */
        post: operations["post_admin_experiments_key_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/guardrails/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Avalia guardrails e pausa automaticamente se violados */
        post: operations["post_admin_experiments_guardrails_check"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/experiments/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Calculadora de amostra/MDE/duração */
        post: operations["post_admin_experiments_plan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/flags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Feature flags */
        get: operations["get_admin_flags"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/flags/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Altera flag (kill switch, rollout, região, plano) */
        patch: operations["patch_admin_flags_key"];
        trace?: never;
    };
    "/admin/growth/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Alertas de growth (guardrail, projeção de custo de IA) */
        get: operations["get_admin_growth_alerts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/growth/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Visão geral (waitlist, alertas abertos) */
        get: operations["get_admin_growth_overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/growth/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Configurações de growth */
        get: operations["get_admin_growth_settings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Atualiza configurações de growth */
        patch: operations["patch_admin_growth_settings"];
        trace?: never;
    };
    "/admin/lifecycle/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Campanhas de lifecycle (D+1/D+7/D+21/D+45/pós-publicação) */
        get: operations["get_admin_lifecycle_campaigns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/lifecycle/campaigns/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Ativa/desativa e ajusta cooldown */
        patch: operations["patch_admin_lifecycle_campaigns_key"];
        trace?: never;
    };
    "/admin/lifecycle/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Executa campanhas (dryRun opcional) */
        post: operations["post_admin_lifecycle_run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/lifecycle/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Envios, aberturas, cliques e conversões por campanha */
        get: operations["get_admin_lifecycle_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Métricas de negócio: MRR/ARR, receita, marketplace, afiliados, publicações, custo de IA, filas */
        get: operations["get_admin_metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/monetization/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Receita por moeda/método, conversão e ARPU */
        get: operations["get_admin_monetization_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/bcp/drill/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST bcp › drill › {name} */
        post: operations["post_admin_ops_bcp_drill_name"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/bcp/scenarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET bcp › scenarios */
        get: operations["get_admin_ops_bcp_scenarios"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/board": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET board */
        get: operations["get_admin_ops_board"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/board/{period}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST board › {period} */
        post: operations["post_admin_ops_board_period"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/board/{period}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST board › {period} › publish */
        post: operations["post_admin_ops_board_period_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/board/compute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST board › compute */
        post: operations["post_admin_ops_board_compute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/ai-act": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › ai-act */
        get: operations["get_admin_ops_compliance_ai_act"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/ai-act/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST compliance › ai-act › sync */
        post: operations["post_admin_ops_compliance_ai_act_sync"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/dpia": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › dpia */
        get: operations["get_admin_ops_compliance_dpia"];
        put?: never;
        /** Operações: POST compliance › dpia */
        post: operations["post_admin_ops_compliance_dpia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/dpia/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › dpia › {id} */
        get: operations["get_admin_ops_compliance_dpia_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/dpia/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST compliance › dpia › {id} › review */
        post: operations["post_admin_ops_compliance_dpia_id_review"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/dsar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › dsar */
        get: operations["get_admin_ops_compliance_dsar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/gate/{country}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › gate › {country} */
        get: operations["get_admin_ops_compliance_gate_country"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/matrix": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › matrix */
        get: operations["get_admin_ops_compliance_matrix"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/retention/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › retention › report */
        get: operations["get_admin_ops_compliance_retention_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/retention/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST compliance › retention › run */
        post: operations["post_admin_ops_compliance_retention_run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/ropa": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › ropa */
        get: operations["get_admin_ops_compliance_ropa"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/ropa/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST compliance › ropa › refresh */
        post: operations["post_admin_ops_compliance_ropa_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/compliance/subprocessors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET compliance › subprocessors */
        get: operations["get_admin_ops_compliance_subprocessors"];
        /** Operações: PUT compliance › subprocessors */
        put: operations["put_admin_ops_compliance_subprocessors"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/exercises": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET exercises */
        get: operations["get_admin_ops_exercises"];
        put?: never;
        /** Operações: POST exercises */
        post: operations["post_admin_ops_exercises"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/exercises/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST exercises › {id} › complete */
        post: operations["post_admin_ops_exercises_id_complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/cache": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET finops › cache */
        get: operations["get_admin_ops_finops_cache"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/cost-import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST finops › cost-import */
        post: operations["post_admin_ops_finops_cost_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/gross-margin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET finops › gross-margin */
        get: operations["get_admin_ops_finops_gross_margin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/guard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST finops › guard */
        post: operations["post_admin_ops_finops_guard"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/guard/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST finops › guard › release */
        post: operations["post_admin_ops_finops_guard_release"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/opportunities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET finops › opportunities */
        get: operations["get_admin_ops_finops_opportunities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/simulate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST finops › simulate */
        post: operations["post_admin_ops_finops_simulate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/top-projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET finops › top-projects */
        get: operations["get_admin_ops_finops_top_projects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/finops/unit-economics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET finops › unit-economics */
        get: operations["get_admin_ops_finops_unit_economics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET incidents */
        get: operations["get_admin_ops_incidents"];
        put?: never;
        /** Operações: POST incidents */
        post: operations["post_admin_ops_incidents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET incidents › {id} */
        get: operations["get_admin_ops_incidents_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/{id}/postmortem": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST incidents › {id} › postmortem */
        post: operations["post_admin_ops_incidents_id_postmortem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/{id}/postmortem/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST incidents › {id} › postmortem › review */
        post: operations["post_admin_ops_incidents_id_postmortem_review"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/{id}/updates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST incidents › {id} › updates */
        post: operations["post_admin_ops_incidents_id_updates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/overdue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET incidents › overdue */
        get: operations["get_admin_ops_incidents_overdue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/incidents/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET incidents › stats */
        get: operations["get_admin_ops_incidents_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/oncall/load": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET oncall › load */
        get: operations["get_admin_ops_oncall_load"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/regional": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET regional */
        get: operations["get_admin_ops_regional"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/release-gate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET release-gate */
        get: operations["get_admin_ops_release_gate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/release-gate/unfreeze": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST release-gate › unfreeze */
        post: operations["post_admin_ops_release_gate_unfreeze"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/residency/distribution": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET residency › distribution */
        get: operations["get_admin_ops_residency_distribution"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/residency/migrate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST residency › migrate */
        post: operations["post_admin_ops_residency_migrate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/slo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET slo */
        get: operations["get_admin_ops_slo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/slo/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET slo › alerts */
        get: operations["get_admin_ops_slo_alerts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/slo/evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST slo › evaluate */
        post: operations["post_admin_ops_slo_evaluate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/slo/ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Operações: POST slo › ingest */
        post: operations["post_admin_ops_slo_ingest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/ops/vendors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operações: GET vendors */
        get: operations["get_admin_ops_vendors"];
        /** Operações: PUT vendors */
        put: operations["put_admin_ops_vendors"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/partners": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista parceiros */
        get: operations["get_admin_partners"];
        put?: never;
        /** Cadastra parceiro (revenue share) */
        post: operations["post_admin_partners"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/partners/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edita parceiro */
        patch: operations["patch_admin_partners_id"];
        trace?: never;
    };
    "/admin/partners/{id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Marca comissões como pagas */
        post: operations["post_admin_partners_id_mark_paid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/partners/{id}/sales": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Vendas e comissões do parceiro */
        get: operations["get_admin_partners_id_sales"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Saques */
        get: operations["get_admin_payouts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/payouts/{id}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aprova (paga) ou rejeita (estorna saldo) — auditado */
        post: operations["post_admin_payouts_id_decision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pricing/{region}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edita preços regionais */
        patch: operations["patch_admin_pricing_region"];
        trace?: never;
    };
    "/admin/recommendations/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Métricas de recomendação (CTR, diversidade, novidade) */
        get: operations["get_admin_recommendations_metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/referrals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Indicações e fraudes */
        get: operations["get_admin_referrals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Denúncias */
        get: operations["get_admin_reports"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve denúncia */
        post: operations["post_admin_reports_id_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/retention/churn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Distribuição do risco de churn */
        get: operations["get_admin_retention_churn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/retention/rfm/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recalcula segmentos RFM */
        post: operations["post_admin_retention_rfm_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/retention/scores/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recalcula churn/LTV/propensão (modelo com timeout e fallback) */
        post: operations["post_admin_retention_scores_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/retention/segments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Segmentos RFM */
        get: operations["get_admin_retention_segments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/templates/{id}/moderate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aprova/reprova template */
        post: operations["post_admin_templates_id_moderate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/templates/pending": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fila de moderação de templates */
        get: operations["get_admin_templates_pending"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Usuários (busca + cursor) */
        get: operations["get_admin_users"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Suspende, troca plano ou ajusta créditos (auditado) */
        patch: operations["patch_admin_users_id"];
        trace?: never;
    };
    "/affiliates/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Contas de afiliado conectadas */
        get: operations["get_affiliates_accounts"];
        put?: never;
        /** Conecta conta de afiliado (token criptografado) */
        post: operations["post_affiliates_accounts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/affiliates/earnings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ganhos e saldo (comissão líquida = bruta − 10%) */
        get: operations["get_affiliates_earnings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/affiliates/links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Links rastreáveis */
        get: operations["get_affiliates_links"];
        put?: never;
        /** Cria link rastreável /r/{linkId} */
        post: operations["post_affiliates_links"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/affiliates/links/{id}/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cliques por dia, conversões e comissão */
        get: operations["get_affiliates_links_id_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analytics/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingestão em lote (sem consentimento de cookies → anonimizado) */
        post: operations["post_analytics_events"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** API keys (sem o segredo) */
        get: operations["get_api_keys"];
        put?: never;
        /** Cria API key `nxr_…` com escopos (exibida uma única vez) */
        post: operations["post_api_keys"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api-keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga API key */
        delete: operations["delete_api_keys_id"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Assets do usuário (opcional: ?projectId=). Requer `ff_assets`. */
        get: operations["get_assets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado, medidas e URL assinada (24 h) do asset, com nome de arquivo padronizado e sem dado pessoal. Requer `ff_assets`. */
        get: operations["get_assets_assetId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/assets/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tipos, perfis de aparelho (Live Photo, Android, PC 1080p/1440p/4K, screensaver) e perfis automotivos (H.264 Baseline). Requer `ff_assets`. */
        get: operations["get_assets_profiles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attribution/touch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra toque (UTM/referrer) anônimo ou autenticado */
        post: operations["post_attribution_touch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Provedores (banner "Seu áudio será processado por…"), humores, SFX e alvo de loudness. Requer `ff_audio`. */
        get: operations["get_audio_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/recordings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Narrações gravadas do usuário (links assinados). Requer `ff_voice_studio`. */
        get: operations["get_audio_studio_recordings"];
        put?: never;
        /** Envia a narração gravada (corpo de áudio: webm/ogg/mp4/m4a/mp3/wav). Checa voz e duração; guarda tratada (ruído reduzido, -16 LUFS). Requer `ff_voice_studio`. */
        post: operations["post_audio_studio_recordings"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/recordings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Apaga a gravação (arquivo e registro). Requer `ff_voice_studio`. */
        delete: operations["delete_audio_studio_recordings_id"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/tracks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Músicas: biblioteca (com licença e crédito) + as do usuário (compostas ou enviadas). Requer `ff_voice_studio`. */
        get: operations["get_audio_studio_tracks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/tracks/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Link assinado para ouvir a música. Requer `ff_voice_studio`. */
        get: operations["get_audio_studio_tracks_id_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/tracks/compose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compõe uma música original no humor pedido, tocada com instrumentos reais (sem direitos de terceiros). Requer `ff_voice_studio`. */
        post: operations["post_audio_studio_tracks_compose"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/tracks/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envia a própria música (corpo de áudio). Exige rights=own|licensed (declaração de direitos). Só o usuário vê. Requer `ff_voice_studio`. */
        post: operations["post_audio_studio_tracks_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/tts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Texto → voz com a voz escolhida; devolve link assinado (ouvir/baixar). Requer `ff_voice_studio`. */
        post: operations["post_audio_studio_tts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/studio/voices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Vozes abertas (Piper/Kokoro) com licença, disponibilidade neste servidor e a voz padrão por gênero. Requer `ff_voice_studio`. */
        get: operations["get_audio_studio_voices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/tracks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Biblioteca de trilhas licenciadas para a região do usuário + trilhas geradas por ele. Requer `ff_audio`. */
        get: operations["get_audio_tracks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/tracks/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** URL assinada (24 h) para ouvir a trilha. Requer `ff_audio`. */
        get: operations["get_audio_tracks_id_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/tracks/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera trilha original por IA a partir de um prompt (tom do vídeo). Requer `ff_audio`. */
        post: operations["post_audio_tracks_generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/voice/clone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cria a voz clonada. 403 sem consentimento verificado. Requer `ff_audio`. */
        post: operations["post_audio_voice_clone"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/voice/consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consentimentos de voz clonada e modelos ativos. Requer `ff_audio`. */
        get: operations["get_audio_voice_consents"];
        put?: never;
        /** Abre um consentimento de voz e devolve a frase única a ser lida na amostra. Requer `ff_audio`. */
        post: operations["post_audio_voice_consents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/voice/consents/{consentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga o consentimento: apaga a amostra e desativa a voz na hora. Requer `ff_audio`. */
        delete: operations["delete_audio_voice_consents_consentId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/voice/consents/{consentId}/sample": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Envia a amostra de voz (áudio cru, ≤5 MB); guardada criptografada. Uma por consentimento. Requer `ff_audio`. */
        put: operations["put_audio_voice_consents_consentId_sample"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/audio/voice/consents/{consentId}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verifica a amostra (duração, fala, ruído) e marca verified_at; se reprovar, apaga a amostra. Requer `ff_audio`. */
        post: operations["post_audio_voice_consents_consentId_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/firebase": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login com Firebase Authentication: troca o ID token (e-mail verificado) por sessão do app */
        post: operations["post_auth_firebase"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login com e-mail/senha (+TOTP para admin/2FA); lockout após falhas */
        post: operations["post_auth_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoga o refresh token informado */
        post: operations["post_auth_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoga todas as sessões do usuário */
        post: operations["post_auth_logout_all"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/magic-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envia link mágico (sempre 202 — não revela se o e-mail existe) */
        post: operations["post_auth_magic_link"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/magic-link/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Valida o token do link mágico */
        post: operations["post_auth_magic_link_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Usuário autenticado */
        get: operations["get_auth_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/oauth/{provider}/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login social (google, apple, meta): troca o code no servidor */
        post: operations["post_auth_oauth_provider_callback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rotaciona o refresh token (detecta reuso e revoga a família) */
        post: operations["post_auth_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cria conta (e-mail + senha, valida idade e consentimento do responsável) */
        post: operations["post_auth_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/totp/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera segredo TOTP (otpauth URL) */
        post: operations["post_auth_totp_setup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/totp/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirma o código e ativa o 2FA */
        post: operations["post_auth_totp_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/background/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Provedor (banner de processamento), operações, formatos de outpainting e mensagens. Requer `ff_background`. */
        get: operations["get_background_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/batch-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lotes */
        get: operations["get_batch_jobs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/batch-jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Progresso do lote */
        get: operations["get_batch_jobs_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/batch-jobs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela lote */
        post: operations["post_batch_jobs_id_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Planos, pacotes de créditos e regras de saque */
        get: operations["get_billing_catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/checkout/credits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Checkout de créditos (Stripe) */
        post: operations["post_billing_checkout_credits"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/checkout/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Checkout de assinatura (Stripe) */
        post: operations["post_billing_checkout_subscription"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/local-payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pagamento local (PIX/OXXO/UPI/GCash/transferência) — Idempotency-Key obrigatória */
        post: operations["post_billing_local_payment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/pix": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cobrança Pix para pacote de créditos */
        post: operations["post_billing_pix"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cotação com impostos (IOF/IVA/GST) e moeda local */
        post: operations["post_billing_quote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Extrato */
        get: operations["get_billing_transactions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Catálogos */
        get: operations["get_catalogs"];
        put?: never;
        /** Cria catálogo */
        post: operations["post_catalogs"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{catalogId}/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** B2B: um e-mail por produto (per_item) ou um único ZIP (zip). Aceita API key com catalogs:read. Requer `ff_email`. */
        post: operations["post_catalogs_catalogId_email"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{catalogId}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** B2B: um ZIP por produto (vídeo + ficha.json + legenda.txt) para o aparelho, a Nuvem NexusReel ou a nuvem do usuário. Aceita API key com catalogs:read. Requer `ff_save`. */
        post: operations["post_catalogs_catalogId_export"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Catálogo com itens e resumo por status */
        get: operations["get_catalogs_id"];
        put?: never;
        post?: never;
        /** Remove catálogo */
        delete: operations["delete_catalogs_id"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{id}/batch-generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera vídeos em lote (plano Pro/Business) */
        post: operations["post_catalogs_id_batch_generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{id}/batch-publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Publica em lote */
        post: operations["post_catalogs_id_batch_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalogs/{id}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Importa itens (JSON, `{csv}` ou `text/csv`; até 500; neutraliza CSV injection; upsert por SKU) */
        post: operations["post_catalogs_id_items"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cloud/{provider}/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Volta do provedor: confere o state, troca o code no servidor, recusa escopo maior que o mínimo e guarda os tokens cifrados (AES-256-GCM, chave do KMS). */
        get: operations["get_cloud_provider_callback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cloud/{provider}/connect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inicia o OAuth (PKCE) com escopo mínimo: drive.file, files.content.write ou Files.ReadWrite.AppFolder. Devolve só a URL de autorização. Requer `ff_save`. */
        post: operations["post_cloud_provider_connect"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cloud/connections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Nuvens do usuário: estado e escopos. Nunca devolve token. Requer `ff_save`. */
        get: operations["get_cloud_connections"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cloud/connections/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga a conexão: avisa o provedor e APAGA os tokens do banco. Funciona mesmo com ff_save desligada (LGPD). */
        delete: operations["delete_cloud_connections_provider"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collab/invites/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aceita o convite (mesmo e-mail do convite; uso único). Requer `ff_collaboration`. */
        post: operations["post_collab_invites_accept"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collab/me/comments/anonymize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** LGPD: anonimiza os meus comentários (o texto fica, o autor some). */
        post: operations["post_collab_me_comments_anonymize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collab/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Projetos em que sou colaborador. Requer `ff_collaboration`. */
        get: operations["get_collab_projects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collab/ws": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** WebSocket da sala do projeto: presença, cursores, operações de timeline (permissão conferida no servidor a cada mensagem) e comentários. */
        get: operations["get_collab_ws"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collab/ws-ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ticket do WebSocket: JWT de 60 s, uso único, enviado na 1ª mensagem (nunca na URL). Requer `ff_collaboration`. */
        post: operations["post_collab_ws_ticket"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consents/external-provider": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consentimento para enviar mídia a provedor externo de IA (R6). Requer um módulo que use provedor (ff_audio ou ff_background). */
        get: operations["get_consents_external_provider"];
        put?: never;
        /** Registra o consentimento external_provider (timestamp, versão, hash de IP/UA, prova). */
        post: operations["post_consents_external_provider"];
        /** Revoga o consentimento external_provider (vale na hora para todos os módulos). */
        delete: operations["delete_consents_external_provider"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/elements/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Provedor (aviso de processamento), tipos, modos de substituição e mensagens. Requer `ff_elements`. */
        get: operations["get_elements_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/elements/person-consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consentimentos person_image do usuário. Requer `ff_elements`. */
        get: operations["get_elements_person_consents"];
        put?: never;
        /** Abre consentimento person_image e devolve a frase única a confirmar. Requer `ff_elements`. */
        post: operations["post_elements_person_consents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/elements/person-consents/{consentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga o consentimento person_image (inserções pendentes passam a falhar sem chamar o provedor). Requer `ff_elements`. */
        delete: operations["delete_elements_person_consents_consentId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/elements/person-consents/{consentId}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirma com a frase digitada (e, opcionalmente, um arquivo de autorização do próprio usuário); grava verified_at. Requer `ff_elements`. */
        post: operations["post_elements_person_consents_consentId_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/email-shares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Envios do usuário (auditoria): arquivo, quantos destinatários, validade, acessos. Nunca devolve os e-mails. Requer `ff_email`. */
        get: operations["get_email_shares"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/email-shares/{shareId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga o link antes do prazo. Requer `ff_email`. */
        delete: operations["delete_email_shares_shareId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/email-shares/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Limites: 20 destinatários por envio, teto diário, validade de 7 dias, senha mínima. Requer `ff_email`. */
        get: operations["get_email_shares_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiments/{key}/assign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Atribui/consulta variante (hash FNV-1a estável; registra exposição) */
        post: operations["post_experiments_key_assign"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiments/{key}/convert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra conversão do experimento (janela por experimento) */
        post: operations["post_experiments_key_convert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiments/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Variantes ativas do usuário (determinístico; control como fallback) */
        get: operations["get_experiments_active"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiments/debug": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Debug de atribuições do admin (/__experiments) */
        get: operations["get_experiments_debug"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flags avaliadas para o usuário (kill switches, rollout) */
        get: operations["get_flags"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/growth/share/{projectId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Link e texto de compartilhamento */
        get: operations["get_growth_share_projectId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/growth/share/{projectId}/card.svg": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cartão de compartilhamento (SVG) */
        get: operations["get_growth_share_projectId_card_svg"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/growth/watermark": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Marca d'água dinâmica por plano */
        get: operations["get_growth_watermark"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness */
        get: operations["get_healthz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/i18n/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perfil de internacionalização por idioma/país (formatos, plataformas, pagamentos, suporte, regulação) */
        get: operations["get_i18n_profile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Contas conectadas (sem tokens) */
        get: operations["get_integrations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/{platform}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Desconecta e apaga tokens */
        delete: operations["delete_integrations_platform"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/{platform}/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Callback OAuth (sem JWT: o usuário vem do `state` secreto de uso único, 10 min): troca o code no servidor e guarda tokens AES-256-GCM */
        get: operations["get_integrations_platform_callback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/{platform}/connect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inicia OAuth (state + PKCE no Redis) */
        post: operations["post_integrations_platform_connect"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/{platform}/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook da plataforma (assinatura sobre o corpo cru; idempotente por event_id) */
        post: operations["post_integrations_platform_webhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/instagram/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Verificação do webhook da Meta (hub.challenge) */
        get: operations["get_integrations_instagram_webhook"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/{sessionId}/watch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Feed público do consumidor: rótulo "IA" sempre visível, aviso, avatar sintético e produto da vez. */
        get: operations["get_live_sessionId_watch"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/consent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Consentimento avatar_live (só para avatar com a própria imagem/voz). Requer `ff_live`. */
        post: operations["post_live_consent"];
        /** Revoga o consentimento (encerra lives com avatar próprio). Requer `ff_live`. */
        delete: operations["delete_live_consent"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Minhas lives e o estado do consentimento avatar_live. Requer `ff_live`. */
        get: operations["get_live_sessions"];
        put?: never;
        /** createLiveSession (Business): catálogo, avatar, opt-in do lojista e rótulo "IA" obrigatórios. 5/h por usuário. Requer `ff_live`. */
        post: operations["post_live_sessions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Live com eventos (criada, aviso de IA exibido, iniciada, encerrada) e exibições do rótulo. Requer `ff_live`. */
        get: operations["get_live_sessions_sessionId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/sessions/{sessionId}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** startLive: grava o aviso de IA e entra no ar (até 3 ao mesmo tempo). Requer `ff_live`. */
        post: operations["post_live_sessions_sessionId_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live/sessions/{sessionId}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** stopLive. Requer `ff_live`. */
        post: operations["post_live_sessions_sessionId_stop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/merges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uniões do usuário (fonte de verdade da origem de um vídeo unido: result_project_id). Requer `ff_merge`. */
        get: operations["get_merges"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/merges/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Transições disponíveis e limites de duração. Requer `ff_merge`. */
        get: operations["get_merges_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Prometheus (Bearer METRICS_TOKEN ou CIDR interno) */
        get: operations["get_metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monetization/paywall/evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decide paywall contextual (limite de frequência, experimentos) */
        post: operations["post_monetization_paywall_evaluate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista notificações (in-app/push/e-mail) */
        get: operations["get_notifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/{id}/action": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Marca lida/clicada/dispensada */
        post: operations["post_notifications_id_action"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preferências (canais, horário silencioso) */
        get: operations["get_notifications_preferences"];
        /** Atualiza preferências / opt-out */
        put: operations["put_notifications_preferences"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/unsubscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Opt-out por link assinado (confirmação) */
        get: operations["get_notifications_unsubscribe"];
        put?: never;
        /** Opt-out por link assinado (one-click) */
        post: operations["post_notifications_unsubscribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/onboarding/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plano de onboarding adaptativo por objetivo */
        get: operations["get_onboarding_plan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Saques do usuário */
        get: operations["get_payouts"];
        put?: never;
        /** Pede saque (mín. R$50; < R$500 aprova e paga automático; ≥ R$500 revisão do admin) */
        post: operations["post_payouts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pricing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preço regional (país informado ou do perfil) */
        get: operations["get_pricing"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pricing/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Regiões de preço, moedas e métodos locais */
        get: operations["get_pricing_regions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista projetos (cursor) */
        get: operations["get_projects"];
        put?: never;
        /** Cria projeto (modera o roteiro; valida fotos e template comprado) */
        post: operations["post_projects"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Projeto com cenas e URLs assinadas */
        get: operations["get_projects_id"];
        put?: never;
        post?: never;
        /** Remove (soft delete) */
        delete: operations["delete_projects_id"];
        options?: never;
        head?: never;
        /** Edita título/roteiro/categoria */
        patch: operations["patch_projects_id"];
        trace?: never;
    };
    "/projects/{id}/assemble": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Monta o vídeo final com FFmpeg (limite mensal por plano) */
        post: operations["post_projects_id_assemble"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Escolhas de áudio do projeto (voz, gravação, música, volume). Requer `ff_voice_studio`. */
        get: operations["get_projects_id_audio_settings"];
        /** Salva as escolhas de áudio do projeto; a montagem aplica (narração gravada ou voz escolhida, música com ducking). Requer `ff_voice_studio`. */
        put: operations["put_projects_id_audio_settings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio/mix": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mixa voz + trilha + SFX (ducking, -14 LUFS, stems) num vídeo NOVO; fila audio-mix. Requer `ff_audio`. */
        post: operations["post_projects_id_audio_mix"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio/revert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Volta para o áudio original (nada é apagado). Requer `ff_audio`. */
        post: operations["post_projects_id_audio_revert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio/sfx-suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sugere SFX com timing pelos cortes de cena do vídeo final. Requer `ff_audio`. */
        post: operations["post_projects_id_audio_sfx_suggestions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versões de áudio com vídeo, mix e os 3 stems em URL assinada de 24 h. Requer `ff_audio`. */
        get: operations["get_projects_id_audio_versions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/audio/versions/{versionId}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Usa esta versão de áudio no preview e na publicação. Requer `ff_audio`. */
        post: operations["post_projects_id_audio_versions_versionId_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/dub": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dublagem/legendas en/es (5 créditos por idioma, estorno em falha) */
        post: operations["post_projects_id_dub"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/generation-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Log incremental da geração (`after`) */
        get: operations["get_projects_id_generation_logs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/localized-versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versões dubladas */
        get: operations["get_projects_id_localized_versions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/scenes/{sceneId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edita cena (texto, prompt, duração, referência) */
        patch: operations["patch_projects_id_scenes_sceneId"];
        trace?: never;
    };
    "/projects/{id}/scenes/{sceneId}/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera a cena (usa o último frame da anterior — chaining); `chain:true` segue para a próxima */
        post: operations["post_projects_id_scenes_sceneId_generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/scenes/{sceneId}/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refaz a cena */
        post: operations["post_projects_id_scenes_sceneId_regenerate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/sections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Salva as seções do vídeo (foto, movimento da foto, o que a imagem faz e o que falar). Texto acima de 15 s continua sozinho em nova seção. Atrás de ff_sections. */
        put: operations["put_projects_id_sections"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{id}/storyboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera storyboard (fila generation-storyboard); `pipeline:true` encadeia cenas e montagem */
        post: operations["post_projects_id_storyboard"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/accessibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Arquivos de acessibilidade do projeto (legendas, audiodescrição, transcrições). Requer `ff_accessibility`. */
        get: operations["get_projects_projectId_accessibility"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/accessibility/audio-description": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Audiodescrição das cenas (filtro de dados sensíveis); fica aguardando revisão humana. Requer `ff_accessibility`. */
        post: operations["post_projects_projectId_accessibility_audio_description"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/accessibility/captions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Legendas animadas por palavra (karaokê) em pt-BR/en/es: ASS + vídeo novo com a legenda. Fila accessibility-generate. Requer `ff_accessibility`. */
        post: operations["post_projects_projectId_accessibility_captions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/accessibility/transcript": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transcrição completa em SRT, VTT ou TXT ASSINADA (HMAC-SHA256), URL assinada, retenção de 90 dias. Requer `ff_accessibility`. */
        post: operations["post_projects_projectId_accessibility_transcript"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/agent/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Comando em linguagem natural → plano em staging (registrado em agent_runs). Nada é aplicado. Requer `ff_agent`. */
        post: operations["post_projects_projectId_agent_plan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/agent/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Histórico do agente: comando, plano, prévia e aplicação (quem/quando). Requer `ff_agent`. */
        get: operations["get_projects_projectId_agent_runs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/agent/runs/{runId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado de uma execução do agente. Requer `ff_agent`. */
        get: operations["get_projects_projectId_agent_runs_runId"];
        put?: never;
        post?: never;
        /** Descarta a execução (não aplicada). Requer `ff_agent`. */
        delete: operations["delete_projects_projectId_agent_runs_runId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/agent/runs/{runId}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aplica a prévia SÓ com {"confirm": true}; cria versão nova (derived_from_scene_id). Requer `ff_agent`. */
        post: operations["post_projects_projectId_agent_runs_runId_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/agent/runs/{runId}/execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Renderiza a prévia do plano (fila agent-execute). 10/h por usuário. Requer `ff_agent`. */
        post: operations["post_projects_projectId_agent_runs_runId_execute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera um asset do vídeo pronto: GIF (loop perfeito, ≤10 s, ≤10 MB), sticker WebP transparente, wallpaper, multimídia automotiva ou screensaver. Fila assets-derive; cache por usuário (user_id + projeto + vídeo + configuração). Requer `ff_assets`. */
        post: operations["post_projects_projectId_assets"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/collaborators": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Membros com papel e presença; convites pendentes só para o dono (sem e-mail). Requer `ff_collaboration`. */
        get: operations["get_projects_projectId_collaborators"];
        put?: never;
        /** Dono convida por e-mail (editor ou viewer). Token assinado, 7 dias, uso único e preso ao e-mail convidado. Requer `ff_collaboration`. */
        post: operations["post_projects_projectId_collaborators"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/collaborators/{memberId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Dono remove um colaborador ou cancela um convite. Requer `ff_collaboration`. */
        delete: operations["delete_projects_projectId_collaborators_memberId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/collaborators/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** LGPD: o colaborador sai do projeto (a sessão em tempo real cai). */
        delete: operations["delete_projects_projectId_collaborators_me"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/comments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Comentários ancorados no tempo do vídeo. Requer `ff_collaboration`. */
        get: operations["get_projects_projectId_comments"];
        put?: never;
        /** Comentar (dono, editor e viewer). Requer `ff_collaboration`. */
        post: operations["post_projects_projectId_comments"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/comments/{commentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Apagar o próprio comentário (o dono apaga qualquer um). Requer `ff_collaboration`. */
        delete: operations["delete_projects_projectId_comments_commentId"];
        options?: never;
        head?: never;
        /** Editar o próprio comentário; resolver/reabrir (dono e editor). Requer `ff_collaboration`. */
        patch: operations["patch_projects_projectId_comments_commentId"];
        trace?: never;
    };
    "/projects/{projectId}/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envia o link (HMAC, 7 dias, senha opcional argon2id) do vídeo ou de um asset do Módulo 6 para até 20 pessoas (um e-mail por pessoa) e/ou para si. Bloqueia e-mail descartável e mensagem com link. 10/min por usuário e 30/min por IP. Requer `ff_email`. */
        post: operations["post_projects_projectId_email"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/insights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estimativas anteriores do projeto. Requer `ff_insights`. */
        get: operations["get_projects_projectId_insights"];
        put?: never;
        /** ESTIMATIVA (rótulo fixo, AI Act) de retenção, CTR e conversão (0–100) com sugestões; só features agregadas, sem PII. 60/h por usuário. Requer `ff_insights`. */
        post: operations["post_projects_projectId_insights"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Une este projeto a outro do MESMO dono (≤60 s cada → ≤120 s): normaliza codec/FPS/resolução/áudio, iguala o nível, escolhe a transição pela emenda (luz, cor, movimento) e cria um NOVO projeto. Projeto de outro usuário → 403. Registrada antes de /projects/{id}. Requer `ff_merge`. */
        post: operations["post_projects_projectId_merge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/merge/{mergeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Progresso por etapa (normalize, analyze, transition, audio, finalize), transição escolhida e motivo, e URL assinada (24 h) do vídeo unido. Requer `ff_merge`. */
        get: operations["get_projects_projectId_merge_mergeId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/save": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Salva o vídeo pronto: `device`/`local_folder`/`icloud` devolvem link assinado (24 h) para o aparelho gravar (galeria, pasta via File System Access, app Arquivos); `google_drive`/`dropbox`/`onedrive` e `nexus_cloud` vão para a fila (202). O original nunca é alterado. Requer `ff_save`. */
        post: operations["post_projects_projectId_save"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/scenes/{sceneId}/background": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Remove, troca (prompt ou upload) ou expande (outpainting) o fundo do vídeo ou da foto da cena. Assíncrono (fila background-edit); o resultado é uma NOVA versão da cena (version+1, derived_from_scene_id); o original nunca é alterado. Requer `ff_background`. */
        patch: operations["patch_projects_projectId_scenes_sceneId_background"];
        trace?: never;
    };
    "/projects/{projectId}/scenes/{sceneId}/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Seletor de versões / reverter: usa esta versão da cena no projeto e na montagem. Nenhuma mídia muda. Requer `ff_background` ou `ff_elements`. */
        put: operations["put_projects_projectId_scenes_sceneId_current"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/scenes/{sceneId}/elements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inserções/substituições da posição da cena, com status. Requer `ff_elements`. */
        get: operations["get_projects_projectId_scenes_sceneId_elements"];
        put?: never;
        /** Insere pessoa/animal/objeto (action=insert, foto de referência) ou substitui (action=replace: recolor/remove numa região). Assíncrono (fila elements-insert); cria NOVA versão da cena com insertedElements. Pessoa real exige consentimento person_image verificado: sem ele, 403 e nada é enviado ao provedor. Requer `ff_elements`. */
        post: operations["post_projects_projectId_scenes_sceneId_elements"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/scenes/{sceneId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versões da cena (mesma posição), a atual, a edição de fundo e os elementos inseridos de cada uma (URLs assinadas de 24 h) e as edições pendentes. Requer `ff_background` ou `ff_elements`. */
        get: operations["get_projects_projectId_scenes_sceneId_versions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/seal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado do selo, selo "IA com direção humana" e download (URL assinada) do vídeo selado. Requer `ff_seal`. */
        get: operations["get_projects_projectId_seal"];
        put?: never;
        /** Ativa o selo: assina o MP4 com C2PA e EMBUTE o manifest (arquivo novo; original intacto). Fila seal-apply. Requer `ff_seal`. */
        post: operations["post_projects_projectId_seal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/seal/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** verifySeal do vídeo selado: lê o manifest EMBUTIDO (nunca URL externa). Requer `ff_seal`. */
        get: operations["get_projects_projectId_seal_verify"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Timeline multi-track (vídeo, áudio, texto, efeitos), montada das cenas na 1ª vez. Requer `ff_timeline`. */
        get: operations["get_projects_projectId_timeline"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline/fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Salva a versão de quem perdeu um conflito crítico como snapshot (fork). Requer `ff_timeline`. */
        post: operations["post_projects_projectId_timeline_fork"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Quem mudou o quê (operações e conflitos). Requer `ff_timeline`. */
        get: operations["get_projects_projectId_timeline_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline/ops": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aplica uma operação (dono/editor; viewer → 403). Propriedade: last-write-wins; estrutural com versão velha: 409 com fork oferecido. Requer `ff_timeline`. */
        post: operations["post_projects_projectId_timeline_ops"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline/snapshots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Histórico de versões: automáticas, manuais, forks e restaurações. Requer `ff_timeline`. */
        get: operations["get_projects_projectId_timeline_snapshots"];
        put?: never;
        /** Salvar uma versão manualmente. Requer `ff_timeline`. */
        post: operations["post_projects_projectId_timeline_snapshots"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/timeline/snapshots/{snapshotId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Restaura uma versão (a atual é guardada antes) e avisa todos (reload). Requer `ff_timeline`. */
        post: operations["post_projects_projectId_timeline_snapshots_snapshotId_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/transcript": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Transcrição mais recente: palavras com início/fim (ms) e cena; `outdated` se o vídeo mudou. Requer `ff_transcript`. */
        get: operations["get_projects_projectId_transcript"];
        put?: never;
        /** Transcreve o vídeo atual com tempo por palavra (fila transcript-generate). 20/h por usuário. Requer `ff_transcript`. */
        post: operations["post_projects_projectId_transcript"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/transcript/edits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Edição pelo texto: apagar palavras/frases (corta o vídeo) ou substituir (TTS no ponto). Gera prévia; nada muda até aplicar. Requer `ff_transcript`. */
        post: operations["post_projects_projectId_transcript_edits"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/transcript/edits/{editId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado e prévia (URL assinada) da edição. Requer `ff_transcript`. */
        get: operations["get_projects_projectId_transcript_edits_editId"];
        put?: never;
        post?: never;
        /** Descarta a prévia. Requer `ff_transcript`. */
        delete: operations["delete_projects_projectId_transcript_edits_editId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{projectId}/transcript/edits/{editId}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aplica a prévia como versão nova (cenas derivadas + vídeo novo; o anterior é mantido). Requer `ff_transcript`. */
        post: operations["post_projects_projectId_transcript_edits_editId_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/sitemap.xml": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sitemap dos templates */
        get: operations["get_public_sitemap_xml"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/templates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Página SEO do template (HTML) */
        get: operations["get_public_templates_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/publications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista publicações (filtro `projectId`) */
        get: operations["get_publications"];
        put?: never;
        /** Publica em 1..7 plataformas (sempre via worker; valida contas, kill switch e metadados antes de enfileirar) */
        post: operations["post_publications"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/publications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status, progresso e link externo */
        get: operations["get_publications_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/publications/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Repete publicação com falha (retoma pelo provider_job_id — sem duplicar o post) */
        post: operations["post_publications_id_retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/r/{linkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Redirecionamento 302 do link de afiliado (cache Redis; clique bufferizado, sem escrita síncrona) */
        get: operations["get_r_linkId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness (Postgres + Redis) */
        get: operations["get_readyz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Feedback (impressão/clique/uso) para CTR, diversidade e novidade */
        post: operations["post_recommendations_events"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/photo-ideas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ideias de fotos */
        get: operations["get_recommendations_photo_ideas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/platforms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plataformas recomendadas */
        get: operations["get_recommendations_platforms"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/prompts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Prompts sugeridos */
        get: operations["get_recommendations_prompts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/publish-time": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Melhor horário para publicar */
        get: operations["get_recommendations_publish_time"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recommendations/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Templates recomendados (cold start → personalizado após N interações) */
        get: operations["get_recommendations_templates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ref/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Registra clique e redireciona ao app */
        get: operations["get_ref_code"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/referrals/click": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra clique de indicação */
        post: operations["post_referrals_click"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/referrals/convert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Vincula cadastro à indicação (antifraude) */
        post: operations["post_referrals_convert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/referrals/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Código, link, estatísticas e recompensas */
        get: operations["get_referrals_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/s/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Página pública do link (HTML sem script) ou JSON (?format=json): arquivo, remetente, validade e se pede senha. */
        get: operations["get_s_token"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/s/{token}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download sem senha: redireciona para URL assinada de 5 min e conta o acesso (200 JSON `{url}` com `Accept: application/json`). */
        get: operations["get_s_token_download"];
        put?: never;
        /** Download com senha (form ou JSON). 5 tentativas erradas por link travam por 15 min (200 JSON `{url}` com `Accept: application/json`). */
        post: operations["post_s_token_download"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/save/batches/{batchId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Progresso do ZIP em lote, com link de cada produto. Requer `ff_save`. */
        get: operations["get_save_batches_batchId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/save/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Destinos, nuvens conectadas (sem token), retenção e cota da Nuvem NexusReel. Requer `ff_save`. */
        get: operations["get_save_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/save/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Salvamentos do usuário (tabela destination_exports) e uso da Nuvem NexusReel. Requer `ff_save`. */
        get: operations["get_save_exports"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/save/exports/{exportId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado de um salvamento; link assinado (24 h) quando o arquivo está na Nuvem NexusReel. Requer `ff_save`. */
        get: operations["get_save_exports_exportId"];
        put?: never;
        post?: never;
        /** Apaga um item da Nuvem NexusReel antes do prazo. Requer `ff_save`. */
        delete: operations["delete_save_exports_exportId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/seal/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Se o selo está configurado, quem assina e o texto do selo. Requer `ff_seal`. */
        get: operations["get_seal_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/seal/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verificação pública: envie o MP4 (video/mp4, até 100 MB); o manifest C2PA embutido é lido e validado (assinatura + hash). Nada é guardado. */
        post: operations["post_seal_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/series": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Minhas séries. Requer `ff_series`. */
        get: operations["get_series"];
        put?: never;
        /** Cria uma série (mininovela, tutorial, lançamento ou livre). Requer `ff_series`. */
        post: operations["post_series"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/series/{seriesId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Série com episódios em ordem, "Anteriormente…", anterior/próximo e CTA por capítulo. Requer `ff_series`. */
        get: operations["get_series_seriesId"];
        put?: never;
        post?: never;
        /** Apaga a série (os vídeos continuam). Requer `ff_series`. */
        delete: operations["delete_series_seriesId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/series/{seriesId}/episodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Adiciona um projeto como próximo episódio (CTA https opcional). Até 50. Requer `ff_series`. */
        post: operations["post_series_seriesId_episodes"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/series/{seriesId}/episodes/{episodeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove o episódio e renumera. Requer `ff_series`. */
        delete: operations["delete_series_seriesId_episodes_episodeId"];
        options?: never;
        head?: never;
        /** CTA do capítulo (link https e rótulo). Requer `ff_series`. */
        patch: operations["patch_series_seriesId_episodes_episodeId"];
        trace?: never;
    };
    "/series/{seriesId}/episodes/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** linkEpisodes: nova ordem (todos os episódios) e continuidade refeita. Requer `ff_series`. */
        put: operations["put_series_seriesId_episodes_order"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status page pública (componentes, incidentes, uptime 90d) */
        get: operations["get_status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/status.rss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Feed RSS dos incidentes */
        get: operations["get_status_rss"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/status/confirm/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Confirma a assinatura do status */
        get: operations["get_status_confirm_token"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/status/subscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Assina atualizações do status (e-mail/SMS, confirmação dupla) */
        post: operations["post_status_subscribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teleprompter/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Minhas sessões de teleprompter. Requer `ff_teleprompter`. */
        get: operations["get_teleprompter_sessions"];
        put?: never;
        /** startSession: roteiro + velocidade, tamanho, espelhamento e contagem regressiva. Requer `ff_teleprompter`. */
        post: operations["post_teleprompter_sessions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teleprompter/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sessão (a gravação fica no aparelho até o envio). Requer `ff_teleprompter`. */
        get: operations["get_teleprompter_sessions_sessionId"];
        put?: never;
        post?: never;
        /** Apaga a sessão e a gravação enviada. Requer `ff_teleprompter`. */
        delete: operations["delete_teleprompter_sessions_sessionId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teleprompter/sessions/{sessionId}/recording": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** recordSession: envia a gravação ao projeto SÓ com opt-in explícito (cabeçalho x-upload-opt-in: true, conferido antes de ler o corpo). WebM/MP4. Requer `ff_teleprompter`. */
        post: operations["post_teleprompter_sessions_sessionId_recording"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Templates aprovados (busca, categoria, ordenação, cursor) */
        get: operations["get_templates"];
        put?: never;
        /** Cria template (entra em moderação) */
        post: operations["post_templates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/templates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalhe (estrutura só para quem comprou) */
        get: operations["get_templates_id"];
        put?: never;
        post?: never;
        /** Remove (soft delete) */
        delete: operations["delete_templates_id"];
        options?: never;
        head?: never;
        /** Edita (volta para moderação) */
        patch: operations["patch_templates_id"];
        trace?: never;
    };
    "/templates/{id}/purchase": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compra com créditos (atômica e idempotente) */
        post: operations["post_templates_id_purchase"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/templates/{id}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Avalia (somente compradores) */
        post: operations["post_templates_id_reviews"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/templates/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Templates do criador (qualquer status) */
        get: operations["get_templates_mine"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/templates/revenue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Receita do criador (80% do preço; taxa 20%) */
        get: operations["get_templates_revenue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transcript/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Retenção, provedor de STT (opt-out de treino) e limites. Requer `ff_transcript`. */
        get: operations["get_transcript_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/uploads/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirma o upload direto (valida tipo/tamanho) */
        post: operations["post_uploads_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/uploads/photo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Envia foto (JPEG/PNG/WebP, magic bytes + antivírus, ≤10 MB); devolve ref */
        put: operations["put_uploads_photo"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/uploads/presign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** URL assinada para upload direto */
        post: operations["post_uploads_presign"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perfil, plano, créditos e saldos */
        get: operations["get_users_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Atualiza nome, idioma e região (campos extras são rejeitados) */
        patch: operations["patch_users_me"];
        trace?: never;
    };
    "/users/me/consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consentimentos vigentes */
        get: operations["get_users_me_consents"];
        put?: never;
        /** Registra consentimentos versionados (cookies, IA, marketing, termos) */
        post: operations["post_users_me_consents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/deletion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Agenda exclusão da conta (+30 dias; bloqueia geração/publicação) */
        post: operations["post_users_me_deletion"];
        /** Cancela a exclusão agendada */
        delete: operations["delete_users_me_deletion"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pede exportação dos dados (ZIP/JSON assíncrono; 3 por 10 min) */
        post: operations["post_users_me_export"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/export/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status da exportação + link assinado de 7 dias */
        get: operations["get_users_me_export_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/i18n-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perfil de internacionalização do usuário */
        get: operations["get_users_me_i18n_profile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/kyc": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado do KYC e da triagem de sanções */
        get: operations["get_users_me_kyc"];
        put?: never;
        /** Envia documento para KYC (saques ≥ R$ 5.000) */
        post: operations["post_users_me_kyc"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/onboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Salva objetivo/país/fuso do onboarding */
        put: operations["put_users_me_onboarding"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me/residency": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Região de residência de dados e rotas de armazenamento do usuário */
        get: operations["get_users_me_residency"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/waitlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Entra na lista de espera (com indicação) */
        post: operations["post_waitlist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/waitlist/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Posição na lista de espera */
        get: operations["get_waitlist_code"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/affiliates/conversion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Conversão confirmada (HMAC `x-nexus-signature`; idempotente por link+pedido) */
        post: operations["post_webhooks_affiliates_conversion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/local": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook de pagamento local (HMAC) */
        post: operations["post_webhooks_local"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/pix": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook Pix (HMAC `x-signature`) */
        post: operations["post_webhooks_pix"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/stripe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook Stripe (assinatura `Stripe-Signature`, tolerância 5 min, idempotente) */
        post: operations["post_webhooks_stripe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AuthResponse: {
            accessToken?: string;
            /** @description Só no modo cookie: enviar em `X-CSRF-Token` no refresh/logout */
            csrfToken?: string;
            expiresIn?: number;
            /** @description Ausente no modo cookie (`X-Session-Mode: cookie`): o refresh vai no cookie httpOnly `nx_rt` */
            refreshToken?: string;
            user?: components["schemas"]["User"];
        };
        BatchJob: {
            completedItems?: number;
            failedItems?: number;
            /** Format: uuid */
            id?: string;
            /** @enum {unknown} */
            status?: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
            totalItems?: number;
            /** @enum {unknown} */
            type?: "generation" | "publication";
        };
        Error: {
            code: string;
            details?: unknown;
            message: string;
            traceId?: string;
        };
        LoginRequest: {
            email: string;
            password: string;
            totp?: string;
        };
        OAuthRequest: {
            code: string;
            locale?: string;
            redirectUri?: string;
        };
        Project: {
            /** Format: date-time */
            createdAt?: string;
            /** @description URL assinada */
            finalVideoUrl?: string | null;
            /** Format: uuid */
            id?: string;
            scenes?: components["schemas"]["Scene"][];
            script?: string;
            /** @enum {unknown} */
            status?: "draft" | "generating" | "ready" | "failed";
            title?: string;
        };
        ProjectCreate: {
            category?: string;
            locale?: string;
            photos?: string[];
            script?: string;
            /** Format: uuid */
            templateId?: string;
            title: string;
        };
        Publication: {
            error?: string | null;
            externalUrl?: string | null;
            /** Format: uuid */
            id?: string;
            platform?: string;
            progress?: number;
            /** Format: uuid */
            projectId?: string;
            retryCount?: number;
            stage?: string;
            /** @enum {unknown} */
            status?: "pending" | "uploading" | "processing" | "published" | "failed";
        };
        PublicationBatch: {
            publications?: components["schemas"]["Publication"][];
        };
        PublicationCreate: {
            /** Format: uuid */
            projectId: string;
            targets: {
                locale?: string;
                metadata?: {
                    affiliate?: boolean;
                    caption?: string;
                    hashtags?: string[];
                    listingId?: string;
                    price?: number;
                    title?: string;
                    visibility?: string;
                };
                /** @enum {unknown} */
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            }[];
        };
        RefreshRequest: {
            /** @description Omitido no modo cookie (usa `nx_rt` + cabeçalho `X-CSRF-Token`) */
            refreshToken?: string;
        };
        RegisterRequest: {
            /** Format: date */
            birthDate?: string;
            /** Format: email */
            email: string;
            guardianConsent?: boolean;
            /** @enum {unknown} */
            locale?: "pt-BR" | "en" | "es";
            name: string;
            password?: string;
        };
        Scene: {
            consistency?: number | null;
            durationSec?: number;
            /** Format: uuid */
            id?: string;
            index?: number;
            lastFrameUrl?: string | null;
            prompt?: string;
            retried?: boolean;
            /** @enum {unknown} */
            status?: "pending" | "generating" | "done" | "error";
            text?: string;
            videoUrl?: string | null;
        };
        SignedDownload: {
            expiresInSec: number;
            /** @description URL assinada (5 min) */
            url: string;
        };
        Template: {
            /** Format: uuid */
            id?: string;
            name?: string;
            owned?: boolean;
            priceCredits?: number;
            ratingAvg?: number;
            ratingCount?: number;
            /** @enum {unknown} */
            status?: "draft" | "pending" | "approved" | "rejected";
            usageCount?: number;
        };
        TemplateInput: {
            category?: string;
            description?: string;
            name: string;
            priceCredits: number;
            promptHints?: string[];
            sceneStructure: Record<string, never>[];
            tags?: string[];
        };
        User: {
            affiliateBalanceCents?: number;
            credits?: number;
            email?: string;
            /** Format: uuid */
            id?: string;
            isAdmin?: boolean;
            /** @enum {unknown} */
            locale?: "pt-BR" | "en" | "es" | "es-MX";
            marketplaceBalanceCents?: number;
            name?: string;
            /** @enum {unknown} */
            plan?: "free" | "pro" | "business";
            region?: string;
        };
        UserPatch: {
            locale?: string;
            name?: string;
            /** @enum {unknown} */
            region?: "LATAM" | "EU" | "US";
        };
    };
    responses: {
        /** @description Erro */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    get_debug: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        env: {
                            /** @enum {string} */
                            aiTts: "elevenlabs" | "espeak" | "kokoro" | "mock" | "open" | "piper";
                            /** @enum {string} */
                            aiVideo: "kling" | "mock";
                            /** @enum {string} */
                            nodeEnv: "development" | "production" | "staging" | "test";
                            /** @enum {string} */
                            paymentsMode: "mock" | "off" | "real";
                            /** @enum {string} */
                            platformMode: "mock" | "real";
                            region: string;
                            /** @enum {string} */
                            storage: "local" | "s3";
                        };
                        flags: {
                            enabled: boolean;
                            key: string;
                            rollout: number;
                        }[];
                        memory: {
                            arrayBuffers: number;
                            external: number;
                            heapTotal: number;
                            heapUsed: number;
                            rss: number;
                        };
                        node: string;
                        queues: {
                            [key: string]: {
                                active: number;
                                delayed: number;
                                dlq: number;
                                failed: number;
                                waiting: number;
                            };
                        };
                        recentRequests: {
                            at: string;
                            method: string;
                            ms: number;
                            route: string;
                            status: number;
                            traceId: string;
                        }[];
                        version: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_accessibility_assets_assetId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        createdAt: string;
                        descriptions?: {
                            endMs: number;
                            redactions: number;
                            scene: number;
                            startMs: number;
                            text: string;
                        }[];
                        errorCode: null | string;
                        expiresAt: null | string;
                        extraFileUrl: null | string;
                        fileUrl: null | string;
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        projectId: string;
                        reviewed: boolean;
                        reviewedAt: null | string;
                        sha256: null | string;
                        signature: null | string;
                        status: string;
                        style: null | {
                            bold: boolean;
                            colors: {
                                /** @enum {string} */
                                box: "#000000" | "#1B1B1B";
                                boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                /** @enum {string} */
                                highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                /** @enum {string} */
                                text: "#FFF8E7" | "#FFFFFF";
                            };
                            contrast: {
                                highlight: number;
                                text: number;
                            };
                            fontScale: number;
                            /** @enum {string} */
                            position: "bottom" | "top";
                            /** @enum {string} */
                            preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                            spacing: 0 | 2;
                        } | {
                            [key: string]: unknown;
                        };
                        type: string;
                        words?: {
                            end: number;
                            scene: number;
                            start: number;
                            w: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    post_accessibility_assets_assetId_review: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                assetId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @constant */
                    approve: true;
                    descriptions?: {
                        scene: number;
                        text: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        createdAt: string;
                        descriptions?: {
                            endMs: number;
                            redactions: number;
                            scene: number;
                            startMs: number;
                            text: string;
                        }[];
                        errorCode: null | string;
                        expiresAt: null | string;
                        extraFileUrl: null | string;
                        fileUrl: null | string;
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        projectId: string;
                        reviewed: boolean;
                        reviewedAt: null | string;
                        sha256: null | string;
                        signature: null | string;
                        status: string;
                        style: null | {
                            bold: boolean;
                            colors: {
                                /** @enum {string} */
                                box: "#000000" | "#1B1B1B";
                                boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                /** @enum {string} */
                                highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                /** @enum {string} */
                                text: "#FFF8E7" | "#FFFFFF";
                            };
                            contrast: {
                                highlight: number;
                                text: number;
                            };
                            fontScale: number;
                            /** @enum {string} */
                            position: "bottom" | "top";
                            /** @enum {string} */
                            preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                            spacing: 0 | 2;
                        } | {
                            [key: string]: unknown;
                        };
                        type: string;
                        words?: {
                            end: number;
                            scene: number;
                            start: number;
                            w: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_accessibility_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        locales: [
                            "pt-BR",
                            "en",
                            "es"
                        ];
                        minContrast: number;
                        presets: {
                            [key: string]: {
                                bold: boolean;
                                colors: {
                                    /** @enum {string} */
                                    box: "#000000" | "#1B1B1B";
                                    boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                    /** @enum {string} */
                                    highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                    /** @enum {string} */
                                    text: "#FFF8E7" | "#FFFFFF";
                                };
                                contrast: {
                                    highlight: number;
                                    text: number;
                                };
                                fontScale: number;
                                /** @enum {string} */
                                position: "bottom" | "top";
                                /** @enum {string} */
                                preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                                spacing: 0 | 2;
                            };
                        };
                        retentionDays: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_accessibility_transcripts_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    content: string;
                    signature: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sha256: string;
                        valid: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_admin_analytics_export: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        erasures: {
                            processed: number;
                        };
                        events: {
                            exported: number;
                            file: null | string;
                            lastId: number;
                            quarantined: number;
                        };
                        snapshots: null | {
                            [key: string]: number;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_analytics_freshness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        exportedAt: null | string;
                        minutes: null | number;
                        ok: boolean;
                        slaMinutes: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_analytics_taxonomy: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        events: {
                            category: string;
                            desc: string;
                            name: string;
                            props: {
                                [key: string]: "boolean" | "number" | "string";
                            };
                            required?: string[];
                            /** @enum {string} */
                            src: "both" | "client" | "server";
                        }[];
                        version: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_attribution_report: {
        parameters: {
            query?: {
                from?: string;
                lookbackDays?: number;
                model?: "first_touch" | "last_touch" | "last_non_direct" | "linear" | "u_shaped" | "time_decay";
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        channels: {
                            campaign: string;
                            conversions: number;
                            medium: string;
                            revenueCents: number;
                            source: string;
                        }[];
                        /** Format: date-time */
                        from: string;
                        /** @enum {string} */
                        model: "first_touch" | "last_non_direct" | "last_touch" | "linear" | "time_decay" | "u_shaped";
                        reconciliation: {
                            attributedTotalCents: number;
                            attributionDeltaCents: number;
                            ok: boolean;
                            stripeDeltaCents: number;
                            stripeTransactionsCents: number;
                            stripeWebhookEventsCents: number;
                            transactionsTotalCents: number;
                        };
                        /** Format: date-time */
                        to: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_audit_logs: {
        parameters: {
            query?: {
                action?: string;
                actor?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            action?: string;
                            /** Format: uuid */
                            actorId?: string;
                            /** Format: date-time */
                            createdAt?: string;
                            /** Format: uuid */
                            id?: string;
                            metadata?: {
                                banned?: boolean;
                                creditsDelta?: number;
                                plan?: string;
                            };
                            /** Format: uuid */
                            targetId?: string;
                            targetType?: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    post_admin_creators_id_verify: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    verified: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        creatorVerified: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_datascience_cohort_ltv: {
        parameters: {
            query?: {
                months?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            cohort: string;
                            ltvCents: {
                                [key: string]: number;
                            };
                            users: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_datascience_forecast_ai_cost: {
        parameters: {
            query?: {
                alert?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alerted: boolean;
                        budgetCents: number;
                        hiCents: number;
                        loCents: number;
                        /** @enum {string} */
                        method: "mean" | "trend" | "trend_weekly";
                        month: string;
                        overBudget: boolean;
                        projectedCents: number;
                        remainingDays: number;
                        spentCents: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_datascience_forecast_revenue: {
        parameters: {
            query?: {
                history?: number;
                horizon?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        history: number;
                        horizon: number;
                        /** @enum {string} */
                        method: "mean" | "trend" | "trend_weekly";
                        points: {
                            day: number;
                            hi: number;
                            lo: number;
                            value: number;
                        }[];
                        totalNext: number;
                        unit: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_datascience_funnel: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        from: string;
                        steps: {
                            /** @enum {string} */
                            name: "project_created" | "subscription_started" | "user_signed_up" | "video_assembled" | "video_published";
                            overall: null | number;
                            stepConversion: null | number;
                            users: number;
                        }[];
                        /** Format: date-time */
                        to: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_datascience_propensity: {
        parameters: {
            query?: {
                limit?: number;
                target?: "upgrade" | "credits";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: unknown[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_dlq: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        queues: {
                            [key: string]: {
                                active: number;
                                delayed: number;
                                dlq: number;
                                failed: number;
                                waiting: number;
                            };
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_experiments: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            alpha: number;
                            baselineRate: null | number;
                            /** Format: date-time */
                            createdAt: string;
                            decision: null | string;
                            decisionNotes: null | string;
                            endAt: null | string;
                            guardrailBreachSince: null | string;
                            guardrails: {
                                alpha?: number;
                                /** @enum {string} */
                                direction: "decrease_bad" | "increase_bad";
                                maxRelativeChange: number;
                                metric: string;
                                minHours: number;
                                minSample?: number;
                            }[];
                            hypothesis: string;
                            id: string;
                            key: string;
                            mdeRelative: null | number;
                            name: string;
                            pausedReason: null | string;
                            power: number;
                            primary: {
                                event: string;
                                label?: string;
                                /** @enum {string} */
                                type: "conversion" | "mean";
                            };
                            requiredPerVariant: null | number;
                            respectsHoldout: boolean;
                            salt: string;
                            secondary: {
                                event: string;
                                label?: string;
                                /** @enum {string} */
                                type: "conversion" | "mean";
                            }[];
                            startAt: null | string;
                            /** @enum {string} */
                            status: "archived" | "concluded" | "draft" | "paused" | "running";
                            target: {
                                countries?: string[];
                                newUsersOnly?: boolean;
                                plans?: string[];
                                regions?: string[];
                            };
                            trafficPct: number;
                            variants: {
                                key: string;
                                name?: string;
                                weight: number;
                            }[];
                            windowDays: number;
                            winner: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default 0.05 */
                    alpha?: number;
                    baselineRate?: number;
                    /** @default 14 */
                    conversionWindowDays?: number;
                    /** @default [] */
                    guardrails?: {
                        alpha?: number;
                        /** @enum {string} */
                        direction: "increase_bad" | "decrease_bad";
                        maxRelativeChange: number;
                        metric: string;
                        minHours: number;
                        minSample?: number;
                    }[];
                    /** @default  */
                    hypothesis?: string;
                    key: string;
                    mdeRelative?: number;
                    name: string;
                    /** @default 0.8 */
                    power?: number;
                    primaryMetric: {
                        event: string;
                        label?: string;
                        /** @enum {string} */
                        type: "conversion" | "mean";
                    };
                    /** @default true */
                    respectsHoldout?: boolean;
                    /** @default [] */
                    secondaryMetrics?: {
                        event: string;
                        label?: string;
                        /** @enum {string} */
                        type: "conversion" | "mean";
                    }[];
                    /** @default {} */
                    target?: {
                        countries?: string[];
                        newUsersOnly?: boolean;
                        plans?: ("free" | "pro" | "business")[];
                        regions?: ("LATAM" | "EU" | "US")[];
                    };
                    /** @default 100 */
                    trafficPct?: number;
                    variants: {
                        key: string;
                        name?: string;
                        weight: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_experiments_key: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_admin_experiments_key: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default 0.05 */
                    alpha?: number;
                    baselineRate?: number;
                    /** @default 14 */
                    conversionWindowDays?: number;
                    /** @default [] */
                    guardrails?: {
                        alpha?: number;
                        /** @enum {string} */
                        direction: "increase_bad" | "decrease_bad";
                        maxRelativeChange: number;
                        metric: string;
                        minHours: number;
                        minSample?: number;
                    }[];
                    /** @default  */
                    hypothesis?: string;
                    mdeRelative?: number;
                    name?: string;
                    /** @default 0.8 */
                    power?: number;
                    primaryMetric?: {
                        event: string;
                        label?: string;
                        /** @enum {string} */
                        type: "conversion" | "mean";
                    };
                    /** @default true */
                    respectsHoldout?: boolean;
                    /** @default [] */
                    secondaryMetrics?: {
                        event: string;
                        label?: string;
                        /** @enum {string} */
                        type: "conversion" | "mean";
                    }[];
                    /** @default {} */
                    target?: {
                        countries?: string[];
                        newUsersOnly?: boolean;
                        plans?: ("free" | "pro" | "business")[];
                        regions?: ("LATAM" | "EU" | "US")[];
                    };
                    /** @default 100 */
                    trafficPct?: number;
                    variants?: {
                        key: string;
                        name?: string;
                        weight: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments_key_conclude: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    decision: "ship" | "keep_control" | "iterate" | "inconclusive";
                    notes?: string;
                    winner?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments_key_pause: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default manual */
                    reason?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_experiments_key_results: {
        parameters: {
            query?: {
                bayes?: "true" | "false";
                correction?: "none" | "bonferroni" | "holm" | "fdr";
            };
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiCostPerUserCents: {
                            [key: string]: {
                                mean: number;
                                n: number;
                            };
                        };
                        /** @enum {string} */
                        correction: "bonferroni" | "fdr" | "holm" | "none";
                        decisionHint: string;
                        experiment: {
                            decision: null | string;
                            key: string;
                            name: string;
                            requiredPerVariant: null | number;
                            startAt: null | string;
                            /** @enum {string} */
                            status: "archived" | "concluded" | "draft" | "paused" | "running";
                            windowDays: number;
                            winner: null | string;
                        };
                        guardrails: {
                            breached: boolean;
                            metric: string;
                            n: number;
                            p: null | number;
                            relativeChange: null | number;
                            variant: string;
                        }[];
                        primary: {
                            alpha: number;
                            /** @enum {string} */
                            correction: "bonferroni" | "fdr" | "holm" | "none";
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            metricType: "conversion" | "mean";
                            primary: boolean;
                            srm: {
                                chi2: number;
                                df: number;
                                mismatch: boolean;
                                p: number;
                            };
                            variants: {
                                key: string;
                                mean?: number;
                                n: number;
                                rate?: number;
                                vsControl?: {
                                    bayes?: {
                                        draws: number;
                                        expectedLossControl: number;
                                        expectedLossTreatment: number;
                                        liftCredible95: [
                                            number,
                                            number
                                        ];
                                        probTreatmentBeatsControl: number;
                                    };
                                    ci: [
                                        number,
                                        number
                                    ];
                                    ciRel: null | [
                                        number,
                                        number
                                    ];
                                    df?: number;
                                    diff: number;
                                    p: number;
                                    pAdjusted: number;
                                    relLift: null | number;
                                    se: number;
                                    significant: boolean;
                                    stat: number;
                                };
                            }[];
                        };
                        sampleSufficient: boolean | null;
                        secondary: {
                            alpha: number;
                            /** @enum {string} */
                            correction: "bonferroni" | "fdr" | "holm" | "none";
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            metricType: "conversion" | "mean";
                            primary: boolean;
                            srm: {
                                chi2: number;
                                df: number;
                                mismatch: boolean;
                                p: number;
                            };
                            variants: {
                                key: string;
                                mean?: number;
                                n: number;
                                rate?: number;
                                vsControl?: {
                                    bayes?: {
                                        draws: number;
                                        expectedLossControl: number;
                                        expectedLossTreatment: number;
                                        liftCredible95: [
                                            number,
                                            number
                                        ];
                                        probTreatmentBeatsControl: number;
                                    };
                                    ci: [
                                        number,
                                        number
                                    ];
                                    ciRel: null | [
                                        number,
                                        number
                                    ];
                                    df?: number;
                                    diff: number;
                                    p: number;
                                    pAdjusted: number;
                                    relLift: null | number;
                                    se: number;
                                    significant: boolean;
                                    stat: number;
                                };
                            }[];
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments_key_start: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        baselineRate: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        decision: null | string;
                        decisionNotes: null | string;
                        endAt: null | string;
                        guardrailBreachSince: null | string;
                        guardrails: {
                            alpha?: number;
                            /** @enum {string} */
                            direction: "decrease_bad" | "increase_bad";
                            maxRelativeChange: number;
                            metric: string;
                            minHours: number;
                            minSample?: number;
                        }[];
                        hypothesis: string;
                        id: string;
                        key: string;
                        mdeRelative: null | number;
                        name: string;
                        pausedReason: null | string;
                        power: number;
                        primary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        };
                        requiredPerVariant: null | number;
                        respectsHoldout: boolean;
                        salt: string;
                        secondary: {
                            event: string;
                            label?: string;
                            /** @enum {string} */
                            type: "conversion" | "mean";
                        }[];
                        startAt: null | string;
                        /** @enum {string} */
                        status: "archived" | "concluded" | "draft" | "paused" | "running";
                        target: {
                            countries?: string[];
                            newUsersOnly?: boolean;
                            plans?: string[];
                            regions?: string[];
                        };
                        trafficPct: number;
                        variants: {
                            key: string;
                            name?: string;
                            weight: number;
                        }[];
                        windowDays: number;
                        winner: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments_guardrails_check: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        results: {
                            /** @enum {string} */
                            action: "breach_ongoing" | "breach_started" | "ok" | "paused";
                            detail?: unknown;
                            key: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_experiments_plan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    alpha?: number;
                    baseline?: number;
                    deltaAbs?: number;
                    eligiblePerDay?: number;
                    mdeRelative?: number;
                    nPerVariant?: number;
                    power?: number;
                    sd?: number;
                    trafficPct?: number;
                    variants: number;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alpha: number;
                        alphaPerComparison: number;
                        mdeAtN?: number;
                        minDurationDays: null | number;
                        power: number;
                        powerAtN?: null | number;
                        requiredPerVariant: number;
                        totalRequired: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_flags: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            description: string;
                            enabled: boolean;
                            key: string;
                            plans: string[];
                            regions: string[];
                            rolloutPercent: number;
                            updatedAt: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_admin_flags_key: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_growth_alerts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            createdAt: string;
                            data?: {
                                avg?: number;
                                breaches?: {
                                    breached: boolean;
                                    metric: string;
                                    n: number;
                                    p: number;
                                    relativeChange: number;
                                    variant: string;
                                }[];
                                budget?: number;
                                hi?: number;
                                key?: string;
                                lo?: number;
                                month?: string;
                                projected?: number;
                                ratio?: number;
                                spent?: number;
                                today?: number;
                            };
                            id: number;
                            kind: string;
                            message: string;
                            resolvedAt: null | string;
                            severity: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_growth_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        openAlerts: number;
                        waitlist: {
                            n: number;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_growth_settings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiCostMonthlyBudgetCents: number;
                        churn: {
                            highRisk: number;
                            modelTimeoutMs: number;
                        };
                        creatorVerifiedFeePct: number;
                        disposableDomains: string[];
                        holdoutPct: number;
                        iofPct: number;
                        lifecycle: {
                            capPerDay: number;
                            capPerWeek: number;
                            defaultQuietEnd: number;
                            defaultQuietStart: number;
                        };
                        paywall: {
                            capPerDayPerTrigger: number;
                            capPerWeek: number;
                        };
                        recommendations: {
                            minInteractionsForPersonalized: number;
                        };
                        referral: {
                            monthlyCapPerReferrer: number;
                            rewardReferredCredits: number;
                            rewardReferrerCredits: number;
                            signupVelocityPerIp24h: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_admin_growth_settings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiCostMonthlyBudgetCents: number;
                        churn: {
                            highRisk: number;
                            modelTimeoutMs: number;
                        };
                        creatorVerifiedFeePct: number;
                        disposableDomains: string[];
                        holdoutPct: number;
                        iofPct: number;
                        lifecycle: {
                            capPerDay: number;
                            capPerWeek: number;
                            defaultQuietEnd: number;
                            defaultQuietStart: number;
                        };
                        paywall: {
                            capPerDayPerTrigger: number;
                            capPerWeek: number;
                        };
                        recommendations: {
                            minInteractionsForPersonalized: number;
                        };
                        referral: {
                            monthlyCapPerReferrer: number;
                            rewardReferredCredits: number;
                            rewardReferrerCredits: number;
                            signupVelocityPerIp24h: number;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_lifecycle_campaigns: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            active: boolean;
                            channel: string;
                            cooldownDays: number;
                            description: string;
                            key: string;
                            priority: number;
                            requiresMarketingConsent: boolean;
                            templateId: string;
                            trigger?: unknown;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_admin_lifecycle_campaigns_key: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        active: boolean;
                        cooldownDays: number;
                        key: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_lifecycle_run: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        runs: {
                            evaluated: number;
                            failed: number;
                            key: string;
                            sent: number;
                            suppressed: {
                                flag_off?: number;
                                frequency_cap?: number;
                                no_consent?: number;
                                opt_out?: number;
                                outside_send_window?: number;
                                quiet_hours?: number;
                            };
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_lifecycle_stats: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            active: boolean;
                            channel: string;
                            clicked: number;
                            converted: number;
                            key: string;
                            opened: number;
                            sent: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_metrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        affiliates: {
                            clicks: number;
                            commissionCents: number;
                            conversions: number;
                        };
                        ai: {
                            calls: number;
                            costCents: number;
                            failures: number;
                            provider: string;
                        }[];
                        arrCents: number;
                        generatedAt: string;
                        marketplace: {
                            feeCredits: number;
                            gmvCredits: number;
                            platformFeePct: number;
                            sales: number;
                        };
                        mrrCents: number;
                        pending: {
                            payouts: number;
                            reports: number;
                            templates: number;
                        };
                        projects: {
                            last24h: number;
                            ready: number;
                            total: number;
                        };
                        publications: {
                            failed: number;
                            ok: number;
                            successRate: null | number;
                            total: number;
                        };
                        queues: {
                            [key: string]: {
                                active: number;
                                delayed: number;
                                dlq: number;
                                failed: number;
                                waiting: number;
                            };
                        };
                        revenue: {
                            creditsSales: number;
                            gross: number;
                            payouts: number;
                        };
                        users: {
                            banned: number;
                            business: number;
                            new7d: number;
                            pro: number;
                            total: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_monetization_summary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        arppuBrlCents: number;
                        arpuBrlCents: number;
                        byRegion: {
                            brlCents: number;
                            currency: string;
                            localCents: number;
                            region?: unknown;
                            transactions?: unknown;
                        }[];
                        conversionFreeToPaid: number;
                        creditPacks?: unknown;
                        days: number;
                        payers?: unknown;
                        revenueBrlCents: number;
                        subscriptions?: unknown;
                        usersPaid?: unknown;
                        usersTotal?: unknown;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_bcp_drill_name: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        exerciseId: string;
                        gaps: string[];
                        limitations: string[];
                        measuredMinutes: number;
                        /** @enum {string} */
                        outcome: "failed" | "gaps_found" | "passed";
                        scenario: string;
                        steps: {
                            detail?: string;
                            ok: boolean;
                            step: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_bcp_scenarios: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        integratedProviders: {
                            moderation: string[];
                            tts: string[];
                            video: string[];
                        };
                        items: {
                            id: string;
                            lastMeasuredMinutes: null | number;
                            lastTestedAt: null | string;
                            name: string;
                            procedureUrl: string;
                            rpoMinutes: number;
                            rtoMinutes: number;
                        }[];
                        overdue: {
                            lastTestedAt: null | string;
                            name: string;
                            rtoMinutes: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_board: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            arrCents: number;
                            burnMultiple: null | number;
                            cashRunwayMonths: null | number;
                            churnPct: null | number;
                            grrPct: null | number;
                            id: string;
                            mrrCents: number;
                            ndrPct: null | number;
                            period: string;
                            publishedAt: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_board_period: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                period: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    cashCents?: number;
                    marketingSpendCents?: number;
                    netBurnMonthlyCents?: number;
                    newCustomers?: number;
                    operatingMarginPct?: number;
                    prevQuarterMarketingSpendCents?: number;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        arrCents: number;
                        burnMultiple: null | number;
                        cashRunwayMonths: null | number;
                        churnPct: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        grrPct: null | number;
                        id: string;
                        metrics?: {
                            arpaCents: unknown;
                            arrCents: number;
                            asOf: string;
                            burnMultiple: unknown;
                            cacCents: unknown;
                            cashRunwayMonths: number;
                            caveats: string[];
                            churned: number;
                            contraction: number;
                            expansion: number;
                            grossMarginPct: unknown;
                            growthBasis: unknown;
                            grrPct: unknown;
                            inputs: {
                                cashCents: number;
                                netBurnMonthlyCents: number;
                            };
                            logoChurnPct: unknown;
                            ltvCents: unknown;
                            ltvToCac: unknown;
                            magicNumber: unknown;
                            missingInputs: string[];
                            momGrowthPct: unknown;
                            mrrCents: number;
                            ndrPct: unknown;
                            netNewArrCents: number;
                            netNewArrQuarterCents: number;
                            paybackMonths: unknown;
                            payingCustomers: number;
                            revenueChurnPct: unknown;
                            ruleOf40: unknown;
                            startMrr: number;
                            yoyGrowthPct: unknown;
                        };
                        mrrCents: number;
                        ndrPct: null | number;
                        period: string;
                        publishedAt: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_board_period_publish: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                period: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        arrCents: number;
                        burnMultiple: null | number;
                        cashRunwayMonths: null | number;
                        churnPct: null | number;
                        /** Format: date-time */
                        createdAt: string;
                        grrPct: null | number;
                        id: string;
                        metrics?: {
                            arpaCents: unknown;
                            arrCents: number;
                            asOf: string;
                            burnMultiple: unknown;
                            cacCents: unknown;
                            cashRunwayMonths: number;
                            caveats: string[];
                            churned: number;
                            contraction: number;
                            expansion: number;
                            grossMarginPct: unknown;
                            growthBasis: unknown;
                            grrPct: unknown;
                            inputs: {
                                cashCents: number;
                                netBurnMonthlyCents: number;
                            };
                            logoChurnPct: unknown;
                            ltvCents: unknown;
                            ltvToCac: unknown;
                            magicNumber: unknown;
                            missingInputs: string[];
                            momGrowthPct: unknown;
                            mrrCents: number;
                            ndrPct: unknown;
                            netNewArrCents: number;
                            netNewArrQuarterCents: number;
                            paybackMonths: unknown;
                            payingCustomers: number;
                            revenueChurnPct: unknown;
                            ruleOf40: unknown;
                            startMrr: number;
                            yoyGrowthPct: unknown;
                        };
                        mrrCents: number;
                        ndrPct: null | number;
                        period: string;
                        publishedAt: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_board_compute: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        arpaCents: null | number;
                        arrCents: number;
                        asOf: string;
                        burnMultiple: null | number;
                        cacCents: null | number;
                        cashRunwayMonths: null | number;
                        caveats: string[];
                        churned: number;
                        contraction: number;
                        expansion: number;
                        grossMarginPct: null | number;
                        growthBasis: null | string;
                        grrPct: null;
                        logoChurnPct: null;
                        ltvCents: null | number;
                        ltvToCac: null | number;
                        magicNumber: null | number;
                        missingInputs: ("cashCents" | "marketingSpendCents" | "netBurnMonthlyCents" | "newCustomers" | "operatingMarginPct" | "prevQuarterMarketingSpendCents")[];
                        momGrowthPct: null | number;
                        mrrCents: number;
                        ndrPct: null;
                        netNewArrCents: number;
                        netNewArrQuarterCents: number;
                        paybackMonths: null | number;
                        payingCustomers: number;
                        revenueChurnPct: null;
                        ruleOf40: null | number;
                        startMrr: number;
                        yoyGrowthPct: null | number;
                    } | {
                        arpaCents: null | number;
                        arrCents: number;
                        asOf: string;
                        burnMultiple: null | number;
                        cacCents: null | number;
                        cashRunwayMonths: null | number;
                        caveats: string[];
                        churned: number;
                        contraction: number;
                        expansion: number;
                        grossMarginPct: null | number;
                        growthBasis: null | string;
                        grrPct: number;
                        logoChurnPct: number;
                        ltvCents: null | number;
                        ltvToCac: null | number;
                        magicNumber: null | number;
                        missingInputs: ("cashCents" | "marketingSpendCents" | "netBurnMonthlyCents" | "newCustomers" | "operatingMarginPct" | "prevQuarterMarketingSpendCents")[];
                        momGrowthPct: null | number;
                        mrrCents: number;
                        ndrPct: number;
                        netNewArrCents: number;
                        netNewArrQuarterCents: number;
                        paybackMonths: null | number;
                        payingCustomers: number;
                        revenueChurnPct: number;
                        ruleOf40: null | number;
                        startMrr: number;
                        yoyGrowthPct: null | number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_ai_act: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        gaps: {
                            modelProvider: string;
                            purpose: string;
                        }[];
                        items: {
                            dataRegion: null | string;
                            dpiaId: null | string;
                            dpiaStatus: null | string;
                            id: string;
                            mitigations: string[];
                            modelProvider: string;
                            purpose: string;
                            riskClassification: string;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_compliance_ai_act_sync: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        registered: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_dpia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            createdAt: string;
                            generatedBy: string;
                            id: string;
                            name: string;
                            nextReviewAt: null | string;
                            reviewedAt: null | string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_compliance_dpia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    automatedDecisions?: boolean;
                    countries?: string[];
                    dataCategories: string[];
                    dpaSigned?: boolean;
                    /** @enum {string} */
                    kind: "ai_provider" | "subprocessor" | "jurisdiction" | "data_type";
                    name: string;
                    processesMinors?: boolean;
                    purpose: string;
                    region?: string;
                    special?: string[];
                    transferOutsideRegion?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        content?: {
                            blockers: unknown[];
                            dataCategories: string[];
                            dataSubjects: string[];
                            dpoConsultation: boolean;
                            humanReviewRequired: boolean;
                            jurisdictions: {
                                code: string;
                                dsarDays: number;
                                law: string;
                                status: string;
                            }[];
                            legalBasis: string;
                            necessityProportionality: string;
                            purpose: string;
                            recipients: string[];
                            residualRisk: string;
                            retention: string[];
                            reviewCadence: string;
                            risks: {
                                id: string;
                                level: string;
                                likelihood: string;
                                mitigations: string[];
                                risk: string;
                                severity: string;
                            }[];
                            status: string;
                            subject: {
                                countries: string[];
                                dataCategories: string[];
                                kind: string;
                                name: string;
                                processesMinors: boolean;
                                purpose: string;
                                transferOutsideRegion: boolean;
                            };
                            title: string;
                            transfers: {
                                outsideRegion: boolean;
                                residencyRoutes: {
                                    dataType: string;
                                    storageRegion: string;
                                    userRegion: string;
                                }[];
                            };
                        };
                        /** Format: date-time */
                        createdAt: string;
                        documentUrl: null | string;
                        generatedBy: string;
                        id: string;
                        markdown: string;
                        name: string;
                        nextReviewAt: null | string;
                        reviewedAt: null | string;
                        reviewedBy: null | string;
                        status: string;
                        subject?: {
                            countries: string[];
                            dataCategories: string[];
                            kind: string;
                            name: string;
                            processesMinors: boolean;
                            purpose: string;
                            transferOutsideRegion: boolean;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_dpia_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        content?: {
                            blockers: unknown[];
                            dataCategories: string[];
                            dataSubjects: string[];
                            dpoConsultation: boolean;
                            humanReviewRequired: boolean;
                            jurisdictions: {
                                code: string;
                                dsarDays: number;
                                law: string;
                                status: string;
                            }[];
                            legalBasis: string;
                            necessityProportionality: string;
                            purpose: string;
                            recipients: string[];
                            residualRisk: string;
                            retention: string[];
                            reviewCadence: string;
                            risks: {
                                id: string;
                                level: string;
                                likelihood: string;
                                mitigations: string[];
                                risk: string;
                                severity: string;
                            }[];
                            status: string;
                            subject: {
                                countries: string[];
                                dataCategories: string[];
                                kind: string;
                                name: string;
                                processesMinors: boolean;
                                purpose: string;
                                transferOutsideRegion: boolean;
                            };
                            title: string;
                            transfers: {
                                outsideRegion: boolean;
                                residencyRoutes: {
                                    dataType: string;
                                    storageRegion: string;
                                    userRegion: string;
                                }[];
                            };
                        };
                        /** Format: date-time */
                        createdAt: string;
                        documentUrl: null | string;
                        generatedBy: string;
                        id: string;
                        markdown: string;
                        name: string;
                        nextReviewAt: null | string;
                        reviewedAt: null | string;
                        reviewedBy: null | string;
                        status: string;
                        subject?: {
                            countries: string[];
                            dataCategories: string[];
                            kind: string;
                            name: string;
                            processesMinors: boolean;
                            purpose: string;
                            transferOutsideRegion: boolean;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_compliance_dpia_id_review: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    decision: "approve" | "reject";
                    notes?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        content?: {
                            blockers: unknown[];
                            dataCategories: string[];
                            dataSubjects: string[];
                            dpoConsultation: boolean;
                            humanReviewRequired: boolean;
                            jurisdictions: {
                                code: string;
                                dsarDays: number;
                                law: string;
                                status: string;
                            }[];
                            legalBasis: string;
                            necessityProportionality: string;
                            purpose: string;
                            recipients: string[];
                            residualRisk: string;
                            retention: string[];
                            reviewCadence: string;
                            risks: {
                                id: string;
                                level: string;
                                likelihood: string;
                                mitigations: string[];
                                risk: string;
                                severity: string;
                            }[];
                            status: string;
                            subject: {
                                countries: string[];
                                dataCategories: string[];
                                kind: string;
                                name: string;
                                processesMinors: boolean;
                                purpose: string;
                                transferOutsideRegion: boolean;
                            };
                            title: string;
                            transfers: {
                                outsideRegion: boolean;
                                residencyRoutes: {
                                    dataType: string;
                                    storageRegion: string;
                                    userRegion: string;
                                }[];
                            };
                        };
                        /** Format: date-time */
                        createdAt: string;
                        documentUrl: null | string;
                        generatedBy: string;
                        id: string;
                        markdown: string;
                        name: string;
                        nextReviewAt: null | string;
                        reviewedAt: null | string;
                        reviewedBy: null | string;
                        status: string;
                        subject?: {
                            countries: string[];
                            dataCategories: string[];
                            kind: string;
                            name: string;
                            processesMinors: boolean;
                            purpose: string;
                            transferOutsideRegion: boolean;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_dsar: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        byRegion: {
                            [key: string]: {
                                avgDays: number;
                                open: number;
                                overdue: number;
                                slaDays: number;
                                total: number;
                                withinSla: number;
                            };
                        };
                        items: {
                            elapsedDays: number;
                            id: string;
                            kind: string;
                            nearDue: boolean;
                            overdue: boolean;
                            region: string;
                            slaDays: number;
                            status: string;
                            withinSla: boolean;
                        }[];
                        nearDue: number;
                        overdue: number;
                        scope: string;
                        total: number;
                        windowDays: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_gate_country: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                country: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        allowed: boolean;
                        country: string;
                        reason: string;
                    } | {
                        allowed: boolean;
                        country: string;
                        dpiaApproved: boolean;
                        jurisdiction: string;
                        /** @enum {string} */
                        matrixStatus: "in_progress" | "not_started" | "ready";
                        reason: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_matrix: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            breachNotice: string;
                            code: string;
                            countries: string[];
                            dsarDays: number;
                            evidence: string[];
                            law: string;
                            obligations: string[];
                            owner: string;
                            /** @enum {string} */
                            region: "BR" | "CA" | "EU" | "US";
                            /** @enum {string} */
                            status: "in_progress" | "not_started" | "ready";
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_retention_report: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            dryRun: boolean;
                            id: number;
                            /** Format: date-time */
                            ranAt: string;
                            results?: {
                                affiliateClicks?: number;
                                aiCache: number;
                                analytics?: number;
                                attributionTouches?: number;
                                deviceFingerprints?: number;
                                dryRun: boolean;
                                eligibleForExpiryReportOnly: {
                                    finalVideosFree: number;
                                    finalVideosPaid: number;
                                    rawScenesPastLifecycle: number;
                                };
                                experimentEvents?: number;
                                exportsExpired: number;
                                generationLogs?: number;
                                growthAlerts?: number;
                                lifecycleSends?: number;
                                notifications?: number;
                                oncallPages: number;
                                recommendationEvents?: number;
                                refreshTokens: number;
                                sloSamples: number;
                                unconfirmedSubscribers: number;
                                webhooks?: number;
                            };
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_compliance_retention_run: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_ropa: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            dataCategories: string[];
                            id: string;
                            jurisdiction: string[];
                            owner: null | string;
                            processingActivity: string;
                            purposeBasis: string;
                            recipients: string[];
                            retention: string;
                            source: string;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                        stale: {
                            processingActivity: string;
                            /** Format: date-time */
                            updatedAt: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_compliance_ropa_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        skipped: string[];
                        upserted: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_compliance_subprocessors: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            contact: null | string;
                            dpaSignedAt: null | string;
                            id: string;
                            location: string;
                            name: string;
                            purpose: string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    put_admin_ops_compliance_subprocessors: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        contact: null | string;
                        dpaSignedAt: null | string;
                        id: string;
                        location: string;
                        name: string;
                        purpose: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_exercises: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            evidenceUrl: null | string;
                            executedAt: null | string;
                            id: string;
                            kind: string;
                            measuredMinutes: null | number;
                            name: string;
                            outcome: null | string;
                            owner: string;
                            postmortemIncidentId: null | string;
                            /** Format: date-time */
                            scheduledFor: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_exercises: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "chaos" | "dr" | "bcp" | "gameday" | "load" | "restore";
                    name: string;
                    owner: string;
                    scheduledFor: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        evidenceUrl: null | string;
                        executedAt: null | string;
                        id: string;
                        kind: string;
                        measuredMinutes: null | number;
                        name: string;
                        outcome: null | string;
                        owner: string;
                        postmortemIncidentId: null | string;
                        /** Format: date-time */
                        scheduledFor: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_exercises_id_complete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    evidenceUrl?: string;
                    measuredMinutes?: number;
                    /** @enum {string} */
                    outcome: "passed" | "gaps_found" | "failed";
                    /** Format: uuid */
                    postmortemIncidentId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        evidenceUrl: null | string;
                        executedAt: null | string;
                        id: string;
                        kind: string;
                        measuredMinutes: null | number;
                        name: string;
                        outcome: null | string;
                        owner: string;
                        postmortemIncidentId: null | string;
                        /** Format: date-time */
                        scheduledFor: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_finops_cache: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        entries: number;
                        hits: number;
                        savedCents: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_finops_cost_import: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    rows: {
                        costCents: number;
                        date: string;
                        provider?: string;
                        service: string;
                        tags?: {
                            [key: string]: string;
                        };
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        imported: number;
                        rejected: {
                            missing: string[];
                            service: string;
                        }[];
                        tagCompliancePct: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_finops_gross_margin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assumptions: {
                            infraAllocation: string;
                            infraCostAvailable: boolean;
                            paymentFeePct: number;
                        };
                        period: {
                            from: string;
                            to: string;
                        };
                        segments: {
                            aiCostCents: number;
                            cogsCents: number;
                            grossMarginPct: null | number;
                            infraAllocatedCents: number;
                            paymentFeesCents: number;
                            revenueCents: number;
                            segment: string;
                            subsidyCents: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_finops_guard: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        anomaly: boolean;
                        avg7dCents: number;
                        killed: boolean;
                        ratio: number;
                        reason?: string;
                        todayCents: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_finops_guard_release: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        generationEnabled: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_finops_opportunities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        dataAvailable: boolean;
                        note: string;
                        opportunities: {
                            basis: string;
                            effort: string;
                            estSavingsCents: null | number;
                            id: string;
                            status: string;
                            title: string;
                        }[];
                        period: {
                            from: string;
                            to: string;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_finops_simulate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    optimizations?: {
                        cacheHitRate?: number;
                        distillSavingsPct?: number;
                        distillShare?: number;
                        routingSavingsPct?: number;
                    };
                    paymentFeePct?: number;
                    priceCents: number;
                    profile?: string | {
                        [key: string]: number;
                    };
                    taxPct?: number;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        after: null | {
                            breakdown: {
                                ai: number;
                                infra: number;
                                paymentFees: number;
                                publications: number;
                                tax: number;
                                tts: number;
                            };
                            cogsCents: number;
                            grossMarginPct: null | number;
                            grossProfitCents: number;
                            netRevenueCents: number;
                            priceCents: number;
                            savingsCents: {
                                [key: string]: number;
                            };
                        };
                        before: {
                            breakdown: {
                                ai: number;
                                infra: number;
                                paymentFees: number;
                                publications: number;
                                tax: number;
                                tts: number;
                            };
                            cogsCents: number;
                            grossMarginPct: null | number;
                            grossProfitCents: number;
                            netRevenueCents: number;
                            priceCents: number;
                            savingsCents: {
                                [key: string]: number;
                            };
                        };
                        projectedImpact: null | {
                            marginPointsGained: null | number;
                            monthlySavingsCentsPerUser: number;
                        };
                        unitCosts: {
                            aiCentsPerVideoSecond: number;
                            infraCentsPerPublication: number;
                            infraCentsPerUserMonth: number;
                            /** @enum {string} */
                            source: "assumed" | "measured";
                            ttsCentsPerLanguage: number;
                        };
                        /** @enum {string} */
                        unitCostsSource: "assumed" | "measured";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_finops_top_projects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            aiCalls: number;
                            costCents: number;
                            durationSec: null | number;
                            plan: string;
                            projectId: string;
                            status: string;
                            title: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_finops_unit_economics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiCostPerProjectCents: null | number;
                        aiCostPerUserMonthCents: null | number;
                        aiCostTotalCents: number;
                        costByProvider: {
                            avgLatencyMs?: unknown;
                            calls?: unknown;
                            costCents: number;
                            operation?: unknown;
                            provider?: unknown;
                        }[];
                        costPerDubbingCents: null | number;
                        costPerPublicationCents: null | number;
                        costPerVideoByDuration: {
                            bucket?: unknown;
                            costPerVideoCents: null | number;
                            videos?: unknown;
                        }[];
                        costPerVideoByPlan: {
                            costPerVideoCents: null | number;
                            plan?: unknown;
                            videos?: unknown;
                        }[];
                        costPerVideoCents: null | number;
                        dubbingNote: string;
                        dubbingVersionsByLocale: unknown[];
                        infraCostAvailable: boolean;
                        infraCostPer1kMauByRegion: {
                            costPer1kMauCents: null | number;
                            mau?: unknown;
                            region?: unknown;
                        }[];
                        infraCostPer1kMauCents: null | number;
                        infraCostTotalCents?: unknown;
                        period: {
                            from: string;
                            to: string;
                        };
                        publicationNote?: string;
                        publicationRetries?: unknown;
                        videos?: unknown;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_incidents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            channel: null | string;
                            commanderId: null | string;
                            components: string[];
                            detectedAt: null | string;
                            id: string;
                            impactSummary: null | string;
                            mitigatedAt: null | string;
                            postmortemUrl: null | string;
                            resolvedAt: null | string;
                            roles?: unknown;
                            severity: string;
                            source: string;
                            /** Format: date-time */
                            startedAt: string;
                            status: string;
                            title: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_incidents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    commanderId?: string;
                    /** @default [] */
                    components?: string[];
                    /** Format: date-time */
                    detectedAt?: string;
                    impact?: string;
                    roles?: {
                        [key: string]: string;
                    };
                    /** @enum {string} */
                    severity: "sev1" | "sev2" | "sev3";
                    title: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        channel: null | string;
                        commanderId: null | string;
                        components: string[];
                        detectedAt: null | string;
                        id: string;
                        impactSummary: null | string;
                        mitigatedAt: null | string;
                        notifierReal: boolean;
                        paged: boolean;
                        postmortemUrl: null | string;
                        resolvedAt: null | string;
                        roles?: {
                            commsLead: string;
                            incidentCommander: string;
                            techLead: string;
                        };
                        severity: string;
                        source: string;
                        /** Format: date-time */
                        startedAt: string;
                        status: string;
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_incidents_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        channel: null | string;
                        commanderId: null | string;
                        components: string[];
                        detectedAt: null | string;
                        id: string;
                        impactSummary: null | string;
                        metrics: {
                            durationMin: null | number;
                            mttdMin: null | number;
                            mttrMin: null | number;
                            ttmMin: null | number;
                        };
                        mitigatedAt: null | string;
                        nextUpdateDueAt: null | string;
                        postmortem: null | {
                            actionsJson?: unknown;
                            /** Format: date-time */
                            createdAt: string;
                            draft: boolean;
                            fiveWhys?: unknown;
                            id: string;
                            incidentId: string;
                            publishedAt: null | string;
                            reviewedAt: null | string;
                            reviewedBy: null | string;
                            rootCause: null | string;
                            timeline?: unknown;
                        };
                        postmortemUrl: null | string;
                        resolvedAt: null | string;
                        roles?: unknown;
                        severity: string;
                        source: string;
                        /** Format: date-time */
                        startedAt: string;
                        status: string;
                        title: string;
                        updates: {
                            authorId: null | string;
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            message: string;
                            public: boolean;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_incidents_id_postmortem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actionsJson?: unknown;
                        /** Format: date-time */
                        createdAt: string;
                        draft: boolean;
                        fiveWhys?: unknown;
                        id: string;
                        incidentId: string;
                        markdown: string;
                        metrics: {
                            durationMin: null | number;
                            mttdMin: null | number;
                            mttrMin: null | number;
                            ttmMin: null | number;
                        };
                        publishedAt: null | string;
                        reviewDueAt: null | string;
                        reviewedAt: null | string;
                        reviewedBy: null | string;
                        rootCause: null | string;
                        timeline?: unknown;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_incidents_id_postmortem_review: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    actions?: unknown[];
                    fiveWhys: {
                        answer: string;
                        why: number;
                    }[];
                    publish?: boolean;
                    rootCause: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actionsJson?: {
                            dueInDays: number;
                            owner: string;
                            title: string;
                            type: string;
                        }[];
                        /** Format: date-time */
                        createdAt: string;
                        draft: boolean;
                        fiveWhys?: {
                            answer: string;
                            why: number;
                        }[];
                        id: string;
                        incidentId: string;
                        publishedAt: null | string;
                        reviewedAt: null | string;
                        reviewedBy: null | string;
                        rootCause: null | string;
                        timeline?: {
                            /** Format: date-time */
                            at: string;
                            source: string;
                            text: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_incidents_id_updates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    message: string;
                    /** @default true */
                    public?: boolean;
                    /** @enum {string} */
                    status?: "investigating" | "identified" | "monitoring" | "resolved";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        channel: null | string;
                        commanderId: null | string;
                        components: string[];
                        detectedAt: null | string;
                        id: string;
                        impactSummary: null | string;
                        metrics: {
                            durationMin: null | number;
                            mttdMin: null | number;
                            mttrMin: null | number;
                            ttmMin: null | number;
                        };
                        mitigatedAt: null | string;
                        nextUpdateDueAt: null | string;
                        postmortem: null | {
                            actionsJson?: {
                                dueInDays: number;
                                owner: string;
                                title: string;
                                type: string;
                            }[];
                            /** Format: date-time */
                            createdAt: string;
                            draft: boolean;
                            fiveWhys?: {
                                answer: string;
                                why: number;
                            }[];
                            id: string;
                            incidentId: string;
                            publishedAt: null | string;
                            reviewedAt: null | string;
                            reviewedBy: null | string;
                            rootCause: null | string;
                            timeline?: {
                                /** Format: date-time */
                                at: string;
                                source: string;
                                text: string;
                            }[];
                        };
                        postmortemUrl: null | string;
                        resolvedAt: null | string;
                        roles?: {
                            commsLead: string;
                            incidentCommander: string;
                            techLead: string;
                        };
                        severity: string;
                        source: string;
                        /** Format: date-time */
                        startedAt: string;
                        status: string;
                        title: string;
                        updates: {
                            authorId: null | string;
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            message: string;
                            public: boolean;
                            status: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_incidents_overdue: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        postmortems: {
                            /** Format: date-time */
                            dueAt: string;
                            incidentId: string;
                            overdue: boolean;
                            published: boolean;
                            reviewed: boolean;
                            severity: string;
                            title: string;
                        }[];
                        updates: {
                            /** Format: date-time */
                            dueAt: string;
                            id: string;
                            lateMin: number;
                            severity: string;
                            title: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_incidents_stats: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bySeverity: {
                            [key: string]: number;
                        };
                        mttdMin: null | number;
                        mttrMin: null | number;
                        total: number;
                        windowDays: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_oncall_load: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        limits: {
                            offHours: number;
                            pages: number;
                        };
                        people: {
                            lastPage: null | string;
                            offHoursPages: number;
                            pages: number;
                            person: string;
                            risk: string;
                            sev1: number;
                            suggestion: null | string;
                        }[];
                        windowDays: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_regional: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        asOf: string;
                        incidents30d: number;
                        notes: string[];
                        regions: {
                            aiCostCents30d: number;
                            d30RetentionApprox: null | number;
                            marginProxyPct: null | number;
                            mau: number;
                            newUsers30d: number;
                            nps: null;
                            region: string;
                            revenueCents30d: number;
                            signupAnomaly: {
                                anomaly: boolean;
                                z: null | number;
                            };
                            signupsToday: number;
                            users: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_release_gate: {
        parameters: {
            query?: {
                type?: "feature" | "fix";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        allowed: boolean;
                        frozen: boolean;
                        reason: string;
                        /** @enum {string} */
                        type: "feature" | "fix";
                        worstBudget: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_release_gate_unfreeze: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reason: string;
                    sreApproval?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        frozen: boolean;
                        override: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_residency_distribution: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            region: string;
                            users: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_residency_migrate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reason: string;
                    /** @enum {string} */
                    to: "BR" | "US" | "EU" | "CA";
                    /** Format: uuid */
                    userId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        from: "BR" | "CA" | "EU" | "US";
                        physicalMoveRequired: boolean;
                        /** @enum {string} */
                        to: "BR" | "CA" | "EU" | "US";
                        userId: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_slo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alerts: {
                            burn: number;
                            firing: boolean;
                            /** @enum {string} */
                            severity: "page" | "ticket";
                            shortBurn: number;
                            threshold: number;
                            /** @enum {string} */
                            window: "1h" | "3d" | "6h";
                        }[];
                        budgetConsumed: number;
                        budgetRemaining: number;
                        burn: {
                            [key: string]: number;
                        };
                        events: number;
                        /** @enum {string} */
                        freeze: "exhausted" | "freeze" | "ok";
                        goodRatio: number;
                        governing: boolean;
                        hoursToExhaustion: number;
                        id: string;
                        owner: string;
                        service: string;
                        sliType: string;
                        target: number;
                        windowDays: number;
                    }[];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_slo_alerts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            alertWindow: string;
                            burnRate: number;
                            /** Format: date-time */
                            firedAt: string;
                            id: string;
                            resolvedAt: null | string;
                            severity: string;
                            sloId: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_slo_evaluate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        fired: {
                            burn: number;
                            severity: string;
                            slo: string;
                            window: string;
                        }[];
                        froze: boolean;
                        frozen: boolean;
                        policy: {
                            freeze: boolean;
                            /** @enum {string} */
                            level: "exhausted" | "freeze" | "ok";
                        };
                        worstBudget: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_ops_slo_ingest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ingested: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_ops_vendors: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            criticality: string;
                            exitPlanUrl: null | string;
                            id: string;
                            owner: string;
                            renewalDate: null | string;
                            service: string;
                            sla: null | string;
                            vendor: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    put_admin_ops_vendors: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        criticality: string;
                        exitPlanUrl: null | string;
                        id: string;
                        owner: string;
                        renewalDate: null | string;
                        service: string;
                        sla: null | string;
                        vendor: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_partners: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            code: string;
                            contact: null | string;
                            contractRef: null | string;
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            name: string;
                            partnerType: string;
                            revenueSharePct: number;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_partners: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    contact?: string;
                    contractRef?: string;
                    name: string;
                    /** @enum {string} */
                    partnerType: "marketplace" | "agency" | "influencer" | "education" | "mei" | "ai_platform" | "integrator" | "affiliate_external";
                    /** @default 0 */
                    revenueSharePct?: number;
                    /**
                     * @default prospect
                     * @enum {string}
                     */
                    status?: "prospect" | "active" | "paused" | "terminated";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        contact: null | string;
                        contractRef: null | string;
                        /** Format: date-time */
                        createdAt: string;
                        id: string;
                        name: string;
                        partnerType: string;
                        revenueSharePct: number;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    patch_admin_partners_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code?: string;
                    contact?: string;
                    contractRef?: string;
                    name?: string;
                    /** @enum {string} */
                    partnerType?: "marketplace" | "agency" | "influencer" | "education" | "mei" | "ai_platform" | "integrator" | "affiliate_external";
                    /** @default 0 */
                    revenueSharePct?: number;
                    /**
                     * @default prospect
                     * @enum {string}
                     */
                    status?: "prospect" | "active" | "paused" | "terminated";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        contact: null | string;
                        contractRef: null | string;
                        /** Format: date-time */
                        createdAt: string;
                        id: string;
                        name: string;
                        partnerType: string;
                        revenueSharePct: number;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_partners_id_mark_paid: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        paidCents: number;
                        paidItems: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_partners_id_sales: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        partner: {
                            code: string;
                            contact: null | string;
                            contractRef: null | string;
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            name: string;
                            partnerType: string;
                            revenueSharePct: number;
                            status: string;
                        };
                        recent: {
                            amountCents: number;
                            /** Format: date-time */
                            createdAt: string;
                            shareCents: number;
                            status: string;
                            transactionId: string;
                        }[];
                        referredUsers: number;
                        totals: {
                            grossCents: number;
                            owedCents: number;
                            paidCents: number;
                            sales: number;
                            shareCents: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_payouts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            amountCents?: unknown;
                            email?: unknown;
                            id?: unknown;
                            processedAt?: unknown;
                            reason?: unknown;
                            requestedAt?: unknown;
                            source?: unknown;
                            status?: unknown;
                            userId?: unknown;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    post_admin_payouts_id_decision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    approve: boolean;
                    reason?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        amountCents: number;
                        awaitingSecondApproval: boolean;
                        gatewayRef: null | string;
                        holdReason: null | string;
                        id: string;
                        processedAt: null | string;
                        reason: null | string;
                        /** Format: date-time */
                        requestedAt: string;
                        source: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_admin_pricing_region: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                region: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        region: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_recommendations_metrics: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        days: number;
                        items: {
                            clicks: number;
                            ctr: number;
                            diversity: number;
                            impressions: number;
                            novelty: number;
                            purchaseRate: number;
                            purchases: number;
                            surface: string;
                            useRate: number;
                            uses: number;
                            variant: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_referrals: {
        parameters: {
            query?: {
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            activatedAt: null | string;
                            code: string;
                            /** Format: date-time */
                            createdAt: string;
                            fraudReason: null | string;
                            id: string;
                            referredId: null | string;
                            referrerId: string;
                            rewardGrantedAt: null | string;
                            signedUpAt: null | string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_admin_reports: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: unknown[];
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    post_admin_reports_id_resolve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        resolved: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_retention_churn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        buckets: {
                            count?: unknown;
                            from: number;
                            to: number;
                        }[];
                        fallbackVersion: string;
                        highRisk?: unknown;
                        ml: {
                            configured: boolean;
                            info?: unknown;
                            ok: boolean;
                        };
                        sources: unknown[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_retention_rfm_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        segments: {
                            [key: string]: number;
                        };
                        users: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_admin_retention_scores_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        fallback: number;
                        model: number;
                        ms: number;
                        scored: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_admin_retention_segments: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: unknown[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_admin_templates_id_moderate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    approve: boolean;
                    reason?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        captionStyle: null | string;
                        category: string;
                        /** Format: date-time */
                        createdAt: string;
                        creatorId: string;
                        description: string;
                        id: string;
                        locale: string;
                        name: string;
                        owned?: boolean;
                        previewUrl: null | string;
                        priceCredits: number;
                        promptHints: string[];
                        ratingAvg: number;
                        ratingCount: number;
                        rejectionReason: null | string;
                        sceneStructure?: {
                            durationSec: number;
                        }[];
                        status: string;
                        tags: string[];
                        trackId: null | string;
                        usageCount: number;
                        voiceId: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_templates_pending: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            captionStyle: null | string;
                            category: string;
                            /** Format: date-time */
                            createdAt: string;
                            creatorId: string;
                            description: string;
                            id: string;
                            locale: string;
                            name: string;
                            owned?: boolean;
                            previewUrl: null | string;
                            priceCredits: number;
                            promptHints: string[];
                            ratingAvg: number;
                            ratingCount: number;
                            rejectionReason: null | string;
                            sceneStructure?: {
                                durationSec: number;
                            }[];
                            status: string;
                            tags: string[];
                            trackId: null | string;
                            usageCount: number;
                            voiceId: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_admin_users: {
        parameters: {
            query?: {
                cursor?: string;
                limit?: number;
                search?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            affiliateBalanceCents: number;
                            banned: boolean;
                            createdAt: string;
                            credits: number;
                            deletionScheduledFor: null | string;
                            email: string;
                            id: string;
                            isAdmin: boolean;
                            locale: string;
                            marketplaceBalanceCents: number;
                            name: string;
                            plan: string;
                            region: string;
                            totpEnabled: boolean;
                        }[];
                        nextCursor: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_admin_users_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    banned?: boolean;
                    creditsDelta?: number;
                    /** @enum {string} */
                    plan?: "free" | "pro" | "business";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        affiliateBalanceCents: number;
                        banned: boolean;
                        createdAt: string;
                        credits: number;
                        deletionScheduledFor: null | string;
                        email: string;
                        id: string;
                        isAdmin: boolean;
                        locale: string;
                        marketplaceBalanceCents: number;
                        name: string;
                        plan: string;
                        region: string;
                        totpEnabled: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_affiliates_accounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            connectedAt: string;
                            externalUserId: string;
                            platform: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_affiliates_accounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    externalUserId: string;
                    /** @enum {string} */
                    platform: "shopee" | "mercadolivre";
                    token: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        connected: boolean;
                        externalUserId: string;
                        /** @enum {string} */
                        platform: "mercadolivre" | "shopee";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_affiliates_earnings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        balanceCents: number;
                        byPlatform: {
                            clicks: null | number;
                            commissionCents: null | number;
                            conversions: null | number;
                            platform: string;
                        }[];
                        clicks: number;
                        conversions: number;
                        platformFeePct: number;
                        rates: {
                            mercadolivre: number;
                            shopee: number;
                        };
                        totalCommissionCents: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_affiliates_links: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            clicks: number;
                            commissionCents: number;
                            conversions: number;
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            originalUrl: string;
                            platform: string;
                            priceCents: number;
                            publicationId: null | string;
                            status: string;
                            trackingUrl: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_affiliates_links: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uri */
                    originalUrl: string;
                    /** @enum {string} */
                    platform: "shopee" | "mercadolivre";
                    priceCents?: number;
                    /** Format: uuid */
                    publicationId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        clicks: number;
                        commissionCents: number;
                        conversions: number;
                        /** Format: date-time */
                        createdAt: string;
                        id: string;
                        originalUrl: string;
                        platform: string;
                        priceCents: number;
                        publicationId: null | string;
                        status: string;
                        trackingUrl: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_affiliates_links_id_stats: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        clicks: number;
                        commissionCents: number;
                        conversions: number;
                        daily: {
                            c: number;
                            d: null | string;
                        }[];
                        id: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_analytics_events: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    anonId?: string;
                    events: {
                        /** Format: uuid */
                        eventId?: string;
                        name: string;
                        /** @default {} */
                        props?: {
                            [key: string]: unknown;
                        };
                    }[];
                    sessionId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accepted: number;
                        quarantined: number;
                        rejected: {
                            index: number;
                            reason: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_api_keys: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            createdAt: string;
                            id: string;
                            lastUsedAt: null | string;
                            name: string;
                            prefix: string;
                            revoked: boolean;
                            scopes: string[];
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_api_keys: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /**
                     * @default [
                     *       "catalogs:read",
                     *       "catalogs:generate"
                     *     ]
                     */
                    scopes?: ("catalogs:read" | "catalogs:generate" | "catalogs:publish")[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt: string;
                        id: string;
                        key: string;
                        name: string;
                        note: string;
                        scopes: string[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    delete_api_keys_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        revoked: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_assets: {
        parameters: {
            query?: {
                projectId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            assetId: string;
                            cacheHit: boolean;
                            createdAt: string;
                            errorCode: null | string;
                            expiresAt: null | string;
                            fileName: null | string;
                            format: string;
                            howTo: null | string;
                            info: {
                                [key: string]: unknown;
                            };
                            mime: null | string;
                            profile: null | string;
                            projectId: null | string;
                            sizeBytes: null | number;
                            status: string;
                            /** @enum {string} */
                            type: "car" | "gif" | "screensaver" | "sticker" | "wallpaper";
                            url: null | string;
                            urlExpiresInSec: null | number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_assets_assetId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        cacheHit: boolean;
                        createdAt: string;
                        errorCode: null | string;
                        expiresAt: null | string;
                        fileName: null | string;
                        format: string;
                        howTo: null | string;
                        info: {
                            [key: string]: unknown;
                        };
                        mime: null | string;
                        profile: null | string;
                        projectId: null | string;
                        sizeBytes: null | number;
                        status: string;
                        /** @enum {string} */
                        type: "car" | "gif" | "screensaver" | "sticker" | "wallpaper";
                        url: null | string;
                        urlExpiresInSec: null | number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_assets_profiles: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        car: {
                            audioKbps: number;
                            brand: string;
                            fps: number;
                            /** @enum {string} */
                            h264Level: "3.1" | "4.0";
                            height: number;
                            id: string;
                            label: string;
                            maxSec: number;
                            note: string;
                            sampleRate: 44100 | 48000;
                            /** @constant */
                            verified: false;
                            videoKbps: number;
                            width: number;
                        }[];
                        device: {
                            defaultSec: number;
                            /** @enum {string} */
                            fill: "blur" | "cover";
                            formats: ("frames_zip" | "live_zip" | "mp4" | "webm")[];
                            fps: number;
                            height: number;
                            id: string;
                            /** @enum {string} */
                            kind: "pc" | "phone_live_android" | "phone_live_ios" | "screensaver";
                            label: string;
                            loop: boolean;
                            maxSec: number;
                            note: string;
                            /** @enum {string} */
                            platform: "android" | "any" | "ios" | "macos" | "windows";
                            width: number;
                        }[];
                        limits: {
                            gifMaxBytes: number;
                            gifMaxSec: number;
                            stickerMaxSec: number;
                            stickerTargetBytes: number;
                            ttlDays: number;
                        };
                        messages: {
                            asset_failed: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            asset_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            clip_too_short: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            invalid_format: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            invalid_profile: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        types: [
                            "gif",
                            "sticker",
                            "wallpaper",
                            "car",
                            "screensaver"
                        ];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_attribution_touch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    anonId?: string;
                    landing?: string;
                    referrer?: string;
                    utm_campaign?: string;
                    utm_content?: string;
                    utm_medium?: string;
                    utm_source?: string;
                    utm_term?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recorded: boolean;
                        source: string;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_audio_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        externalProcessing: {
                            music: boolean;
                            voice: boolean;
                        };
                        messages: {
                            audio_format_unsupported: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            audio_version_not_usable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            consent_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            consent_phrase: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            consent_revoked: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            external_provider_consent_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            music_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            music_rights_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            music_too_large: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            music_track_missing: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            music_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_no_voice: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_too_large: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_too_long: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            recording_too_short: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            sample_already_uploaded: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            sample_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            sample_missing: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            sample_too_large: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            track_not_available: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            tts_text_too_long: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            tts_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            voice_consent_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            voice_model_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            voice_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            voice_sample_rejected: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            voice_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        moods: string[];
                        notice: string;
                        providers: {
                            mixing: string;
                            /** @enum {string} */
                            music: "composer" | "mock";
                            sfx: string;
                            /** @constant */
                            voice: "mock";
                        };
                        sfx: {
                            durationSec: number;
                            id: string;
                            label: string;
                        }[];
                        stemUrlTtlSec: number;
                        targetLufs: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_audio_studio_recordings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            createdAt: string;
                            durationSec: number;
                            id: string;
                            projectId: null | string;
                            url: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_audio_studio_recordings: {
        parameters: {
            query?: {
                projectId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        durationSec: number;
                        id: string;
                        projectId: null | string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_audio_studio_recordings_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deleted: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_audio_studio_tracks: {
        parameters: {
            query?: {
                mood?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        composer: boolean;
                        items: {
                            attribution: null | string;
                            bpm: number;
                            durationSec: number;
                            genre: string;
                            id: string;
                            license: null | string;
                            licenseRegions: string[];
                            mine: boolean;
                            mood: string;
                            source: string;
                            sourceUrl: null | string;
                            title: string;
                        }[];
                        moods: ("calm" | "corporate" | "emotional" | "energetic" | "epic" | "fun" | "lofi" | "upbeat")[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_audio_studio_tracks_id_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        url: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_audio_studio_tracks_compose: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bpm: number;
                        durationSec: number;
                        genre: string;
                        id: string;
                        licenseRegions: string[];
                        mood: string;
                        source: string;
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    post_audio_studio_tracks_upload: {
        parameters: {
            query?: {
                rights?: string;
                title?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bpm: number;
                        durationSec: number;
                        genre: string;
                        id: string;
                        licenseRegions: string[];
                        mood: string;
                        source: string;
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_audio_studio_tts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        durationSec: number;
                        expiresInSec: number;
                        id: string;
                        url: string;
                        voice: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_audio_studio_voices: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        composer: boolean;
                        defaults: {
                            female: null | string;
                            male: null | string;
                        };
                        fallback: string;
                        items: {
                            available: boolean;
                            /** @enum {string} */
                            commercial: "ok" | "review";
                            /** @enum {string} */
                            engine: "kokoro" | "piper";
                            /** @enum {string} */
                            gender: "female" | "male";
                            id: string;
                            label: string;
                            license: string;
                            /** @enum {string} */
                            locale: "en" | "es" | "pt-BR";
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_audio_tracks: {
        parameters: {
            query?: {
                bpmMax?: number;
                bpmMin?: number;
                genre?: string;
                limit?: number;
                maxDurationSec?: number;
                minDurationSec?: number;
                mood?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            bpm: number;
                            durationSec: number;
                            genre: string;
                            id: string;
                            licenseRegions: string[];
                            mood: string;
                            source: string;
                            title: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_audio_tracks_id_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        url: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_audio_tracks_generate: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default 30 */
                    durationSec?: number;
                    prompt: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bpm: number;
                        durationSec: number;
                        genre: string;
                        id: string;
                        licenseRegions: string[];
                        mood: string;
                        source: string;
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    post_audio_voice_clone: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    consentId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        provider: string;
                        voiceModelId: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_audio_voice_consents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            consentId: string;
                            requestedAt: string;
                            revokedAt: null | string;
                            /** @enum {string} */
                            status: "awaiting_sample" | "pending_review" | "revoked" | "verified";
                            verifiedAt: null | string;
                            voiceModels: {
                                /** Format: date-time */
                                createdAt: string;
                                id: string;
                                provider: string;
                            }[];
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_audio_voice_consents: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        consentId: string;
                        phrase: string;
                        /** @enum {string} */
                        status: "awaiting_sample" | "pending_review" | "revoked" | "verified";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_audio_voice_consents_consentId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "awaiting_sample" | "pending_review" | "revoked" | "verified";
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    put_audio_voice_consents_consentId_sample: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                    } | {
                        consentId: string;
                        /** @enum {string} */
                        status: "awaiting_sample" | "pending_review" | "revoked" | "verified";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_audio_voice_consents_consentId_verify: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        checks: {
                            [key: string]: boolean | number;
                        };
                        verifiedAt: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_firebase: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
        };
    };
    post_auth_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            423: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    all?: boolean;
                    refreshToken: string;
                };
            };
        };
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_auth_logout_all: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_auth_magic_link: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /**
                     * @default pt-BR
                     * @enum {string}
                     */
                    locale?: "pt-BR" | "en" | "es" | "es-MX";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sent: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    post_auth_magic_link_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_auth_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_auth_oauth_provider_callback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                provider: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OAuthRequest"];
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
        };
    };
    post_auth_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_auth_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            400: components["responses"]["Error"];
            403: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_totp_setup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        otpauthUrl: string;
                        secret: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_auth_totp_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accessToken: string;
                        csrfToken?: string;
                        expiresIn: number;
                        mfaRequired?: boolean;
                        refreshToken?: string;
                        /** @constant */
                        tokenType: "Bearer";
                        user: {
                            affiliateBalanceCents: number;
                            banned: boolean;
                            createdAt: string;
                            credits: number;
                            deletionScheduledFor: null | string;
                            email: string;
                            id: string;
                            isAdmin: boolean;
                            locale: string;
                            marketplaceBalanceCents: number;
                            name: string;
                            plan: string;
                            region: string;
                            totpEnabled: boolean;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_background_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aspects: ("16:9" | "1:1" | "9:16")[];
                        externalProcessing: boolean;
                        messages: {
                            aspect_unchanged: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            background_source_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            background_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            background_upload_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            external_provider_consent_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            photo_missing: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            scene_media_missing: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            scene_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            version_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        notice: string;
                        operations: string[];
                        /** @constant */
                        provider: "mock";
                        urlTtlSec: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_batch_jobs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            catalogId: string;
                            completedItems: number;
                            /** Format: date-time */
                            createdAt: string;
                            failedItems: number;
                            finishedAt: null | string;
                            id: string;
                            status: string;
                            totalItems: number;
                            type: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_batch_jobs_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BatchJob"];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_batch_jobs_id_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        catalogId: string;
                        completedItems: number;
                        /** Format: date-time */
                        createdAt: string;
                        failedItems: number;
                        finishedAt: null | string;
                        id: string;
                        status: string;
                        totalItems: number;
                        type: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_billing_catalog: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        autoApproveBelowCents: number;
                        creditPacks: {
                            credits: number;
                            id: string;
                            priceCents: number;
                        }[];
                        creditValueCents: number;
                        minPayoutCents: number;
                        plans: ({
                            id: string;
                            /** @constant */
                            name: "Pro";
                            /** @constant */
                            priceCents: 4900;
                        } | {
                            id: string;
                            /** @constant */
                            name: "Business";
                            /** @constant */
                            priceCents: 19900;
                        })[];
                    };
                };
            };
        };
    };
    post_billing_checkout_credits: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    packId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        credits: number;
                        /** @constant */
                        mode: "mock";
                        priceCents: number;
                        sessionId: string;
                        url: string;
                    } | {
                        credits: number;
                        /** @constant */
                        mode: "real";
                        priceCents: number;
                        sessionId: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_billing_checkout_subscription: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    plan: "pro" | "business";
                    /** @enum {string} */
                    priceKey?: "pro" | "pro_low" | "pro_high";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        amountCents: 4900 | 19900;
                        /** @constant */
                        mode: "mock";
                        sessionId: string;
                        url: string;
                    } | {
                        amountCents: 4900 | 19900;
                        /** @constant */
                        mode: "real";
                        sessionId: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_billing_local_payment: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    country?: string;
                    /** @enum {string} */
                    method: "oxxo" | "spei" | "upi" | "gcash" | "bank_transfer" | "boleto" | "qris" | "netbanking";
                    packId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        amountMinor: number;
                        chargeId: string;
                        credits?: number;
                        currency: string;
                        display: {
                            iof: string;
                            perMonth?: string;
                            subtotal: string;
                            tax: string;
                            total: string;
                        };
                        /** @enum {string} */
                        method: "bank_transfer" | "boleto" | "gcash" | "netbanking" | "oxxo" | "qris" | "spei" | "upi";
                        /** @constant */
                        mode: "mock";
                        payment: {
                            barcode: string;
                            expiresAt: string;
                            instructions: string;
                            reference: string;
                        } | {
                            clabe: string;
                            expiresAt: string;
                            reference: string;
                        } | {
                            expiresAt: string;
                            intent: string;
                        } | {
                            checkoutUrl: string;
                            expiresAt: string;
                        } | {
                            expiresAt: string;
                            line: string;
                        } | {
                            expiresAt: string;
                            qrString: string;
                        } | {
                            bank: string;
                            expiresAt: string;
                            virtualAccount: string;
                        };
                        tax: {
                            inclusive: boolean;
                            kind: string;
                            minor: number;
                            pct: number;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_billing_pix: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    packId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        amountCents: number;
                        chargeId: string;
                        copyPaste: string;
                        credits: number;
                        expiresAt: string;
                        /** @constant */
                        mode: "mock";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_billing_quote: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    country?: string;
                    item: {
                        /**
                         * @default monthly
                         * @enum {string}
                         */
                        billing?: "monthly" | "annual";
                        /** @constant */
                        kind: "plan";
                        /** @enum {string} */
                        plan: "pro" | "business";
                    } | {
                        /** @constant */
                        kind: "credits";
                        packId: string;
                    };
                    method?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        country: null | string;
                        credits?: number;
                        currency: string;
                        display: {
                            iof: string;
                            perMonth?: string;
                            subtotal: string;
                            tax: string;
                            total: string;
                        };
                        iofMinor: number;
                        item: {
                            /** @enum {string} */
                            billing?: "annual" | "monthly";
                            /** @constant */
                            kind: "plan";
                            /** @enum {string} */
                            plan: "business" | "pro";
                        } | {
                            /** @constant */
                            kind: "credits";
                            packId: string;
                        };
                        locale: string;
                        method?: string;
                        methods: string[];
                        netMinor: number;
                        region: string;
                        subtotalMinor: number;
                        tax: {
                            inclusive: boolean;
                            kind: string;
                            pct: number;
                        };
                        taxMinor: number;
                        totalMinor: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_billing_transactions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            amountCents: number;
                            /** Format: date-time */
                            createdAt: string;
                            creditsDelta: number;
                            id: string;
                            source: string;
                            type: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_catalogs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            createdAt: string;
                            defaultTemplateId: null | string;
                            description: string;
                            id: string;
                            items?: number;
                            name: string;
                            niche: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_catalogs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    defaultTemplateId?: string;
                    description?: string;
                    name: string;
                    niche?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt: string;
                        defaultTemplateId: null | string;
                        description: string;
                        id: string;
                        items?: number;
                        name: string;
                        niche: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_catalogs_catalogId_email: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                catalogId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default false */
                    includeSelf?: boolean;
                    itemIds?: string[];
                    message?: string;
                    /** @enum {string} */
                    mode: "per_item" | "zip";
                    password?: string;
                    /** @default [] */
                    recipients?: string[];
                    senderName?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchId: string;
                        expiresAt: string;
                        items: number;
                        /** @enum {string} */
                        mode: "per_item" | "zip";
                        shares: {
                            catalogItemId: null | string;
                            fileName: null | string;
                            shareId: string;
                        }[];
                        skipped: {
                            itemId: string;
                            reason: string;
                            sku: string;
                        }[];
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_catalogs_catalogId_export: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                catalogId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    destination: "device" | "nexus_cloud" | "google_drive" | "dropbox" | "onedrive";
                    itemIds?: string[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchId: string;
                        catalogId: string;
                        /** @enum {string} */
                        destination: "device" | "dropbox" | "google_drive" | "nexus_cloud" | "onedrive";
                        items: {
                            exportId: string;
                            itemId: string;
                            sku: string;
                            status: string;
                        }[];
                        skipped: {
                            itemId: string;
                            reason: string;
                            sku: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_catalogs_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt: string;
                        defaultTemplateId: null | string;
                        description: string;
                        id: string;
                        items?: number;
                        itemsList: {
                            category: string;
                            description: string;
                            error: null | string;
                            id: string;
                            name: string;
                            photoUrls: string[];
                            price: number;
                            projectId: null | string;
                            sku: string;
                            status: string;
                        }[];
                        name: string;
                        niche: string;
                        summary: {
                            [key: string]: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    delete_catalogs_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deleted: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_catalogs_id_batch_generate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    itemIds?: string[];
                    /** @enum {string} */
                    locale?: "pt-BR" | "en" | "es";
                    /** Format: uuid */
                    templateId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BatchJob"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_catalogs_id_batch_publish: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    itemIds?: string[];
                    metadata?: {
                        [key: string]: unknown;
                    };
                    platforms: ("tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre")[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BatchJob"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_catalogs_id_items: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    csv?: string;
                    items?: {
                        category?: string;
                        description?: string;
                        name: string;
                        photoUrls?: string[] | string;
                        price?: number | string;
                        sku?: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        errors: {
                            error: string;
                            row: number;
                        }[];
                        imported: number;
                        skipped: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_cloud_provider_callback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                provider: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        connected: boolean;
                        /** @enum {string} */
                        provider: "dropbox" | "google_drive" | "onedrive";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_cloud_provider_connect: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                provider: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        /** @enum {string} */
                        provider: "dropbox" | "google_drive" | "onedrive";
                        scopes: string[];
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_cloud_connections: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        icloud: {
                            note: string;
                            via: string;
                        };
                        items: {
                            available: boolean;
                            connectedAt: null | string;
                            /** @enum {string} */
                            provider: "dropbox" | "google_drive" | "onedrive";
                            scopes: string[];
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_cloud_connections_provider: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                provider: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        provider: "dropbox" | "google_drive" | "onedrive";
                        /** @constant */
                        revoked: true;
                        tokensDeleted: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_collab_invites_accept: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        projectId: string;
                        /** @enum {string} */
                        role: "editor" | "owner" | "viewer";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_collab_me_comments_anonymize: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    projectId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        anonymized: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_collab_projects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            ownerName: string;
                            projectId: string;
                            /** @enum {string} */
                            role: "editor" | "owner" | "viewer";
                            since: string;
                            title: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_collab_ws: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            101: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
        };
    };
    post_collab_ws_ticket: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    projectId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        ticket: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_consents_external_provider: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        acceptedAt: null | string;
                        granted: boolean;
                        version: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_consents_external_provider: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        acceptedAt: null | string;
                        granted: boolean;
                        version: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_consents_external_provider: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        acceptedAt: null | string;
                        granted: boolean;
                        version: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_elements_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        externalProcessing: boolean;
                        messages: {
                            consent_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            consent_revoked: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            elements_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            evidence_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            external_provider_consent_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            person_consent_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            person_phrase: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            phrase_mismatch: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            reference_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            reference_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            region_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            scene_media_missing: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            scene_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        notice: string;
                        /** @constant */
                        provider: "mock";
                        replaceModes: string[];
                        types: string[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_elements_person_consents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            consentId: string;
                            hasEvidence: boolean;
                            requestedAt: string;
                            status: string;
                            verifiedAt: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_elements_person_consents: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        consentId: string;
                        phrase: string;
                        /** @constant */
                        status: "pending";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_elements_person_consents_consentId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        consentId: string;
                        /** @constant */
                        status: "revoked";
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_elements_person_consents_consentId_confirm: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consentId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    evidenceRef?: string;
                    phrase: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        consentId: string;
                        /** @constant */
                        status: "verified";
                        verifiedAt: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_email_shares: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            accessCount: number;
                            assetId: null | string;
                            batchId: null | string;
                            expiresAt: string;
                            fileName: null | string;
                            hasPassword: boolean;
                            includeSelf: boolean;
                            kind: string;
                            lastAccessAt: null | string;
                            projectId: null | string;
                            recipients: number;
                            sentAt: null | string;
                            shareId: string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_email_shares_shareId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                shareId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_email_shares_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        dailyRecipients: number;
                        maxRecipients: number;
                        messageMax: number;
                        messages: {
                            asset_not_ready: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            batch_empty: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            batch_too_large: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            catalog_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            daily_limit: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            disposable_domain: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            link_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            message_has_link: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            no_recipients: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            share_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            too_many_attempts: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            too_many_recipients: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            wrong_password: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        passwordMin: number;
                        rateLimit: {
                            perIpPerMin: number;
                            perUserPerMin: number;
                        };
                        ttlDays: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_experiments_key_assign: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default true */
                    expose?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        exposed?: boolean;
                        fallback?: boolean;
                        inExperiment: boolean;
                        key: string;
                        reason: string;
                        variant: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_experiments_key_convert: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recorded: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_experiments_active: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        experiments: {
                            [key: string]: {
                                inExperiment: boolean;
                                reason: string;
                                variant: string;
                            };
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_experiments_debug: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        active: {
                            [key: string]: {
                                inExperiment: boolean;
                                reason: string;
                                variant: string;
                            };
                        };
                        definitions: {
                            key: string;
                            /** @enum {string} */
                            status: "archived" | "concluded" | "draft" | "paused" | "running";
                            trafficPct: number;
                            variants: string[];
                        }[];
                        userId: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_flags: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        flags: {
                            [key: string]: boolean;
                        };
                    };
                };
            };
        };
    };
    get_growth_share_projectId: {
        parameters: {
            query?: {
                channel?: string;
            };
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        card: {
                            cta: string;
                            height: number;
                            svgUrl: string;
                            width: number;
                        };
                        madeWith: {
                            text: string;
                            url: string;
                        };
                        url: string;
                        watermark: {
                            enabled: boolean;
                            qr: boolean;
                            reason: string;
                            text: null;
                            url: null;
                        } | {
                            enabled: boolean;
                            qr: boolean;
                            reason: string;
                            text: null;
                            url: null;
                            variant: string;
                        } | {
                            enabled: boolean;
                            qr: boolean;
                            reason: string;
                            text: string;
                            url: string;
                            variant: string;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_growth_share_projectId_card_svg: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_growth_watermark: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        enabled: boolean;
                        qr: boolean;
                        reason: string;
                        text: null;
                        url: null;
                    } | {
                        enabled: boolean;
                        qr: boolean;
                        reason: string;
                        text: null;
                        url: null;
                        variant: string;
                    } | {
                        enabled: boolean;
                        qr: boolean;
                        reason: string;
                        text: string;
                        url: string;
                        variant: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_healthz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        status: string;
                        uptimeSec: number;
                    };
                };
            };
        };
    };
    get_i18n_profile: {
        parameters: {
            query: {
                country?: string;
                locale: "pt-BR" | "en" | "es" | "es-MX";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiRegulation: string[];
                        country: string;
                        culturalNotes: string[];
                        dominantPlatforms: string[];
                        dsarDays: null | number;
                        language: string;
                        locale: string;
                        musicPackIds: string[];
                        payments: {
                            currency: string;
                            invoiceRequired: boolean;
                            methods: string[];
                            taxName: string;
                            taxPct: null | number;
                        };
                        /** @enum {string} */
                        residency: "BR" | "CA" | "EU" | "US";
                        rtl: boolean;
                        support: {
                            channels: string[];
                            firstResponseSlaHours: number;
                            hours: string;
                            language: string;
                        };
                        videoFormats: string[];
                    };
                };
            };
        };
    };
    get_integrations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        appStatus: {
                            /** @enum {string} */
                            mode: "mock" | "real";
                            tiktokAudited: boolean;
                            youtubeVerified: boolean;
                        };
                        items: {
                            connectedAt: null | string;
                            expiresAt: null | string;
                            handle: null | string;
                            /** @enum {string} */
                            platform: "instagram" | "mercadolivre" | "olx" | "shopee" | "temu" | "tiktok" | "youtube";
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    delete_integrations_platform: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
        };
    };
    get_integrations_platform_callback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        connected: boolean;
                        handle?: string;
                        /** @enum {string} */
                        platform: "instagram" | "mercadolivre" | "olx" | "shopee" | "temu" | "tiktok" | "youtube";
                    };
                };
            };
        };
    };
    post_integrations_platform_connect: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    shopId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        state: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_integrations_platform_webhook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        duplicate: boolean;
                        received: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_integrations_instagram_webhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
        };
    };
    get_live_sessionId_watch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiLabel: {
                            /** @enum {string} */
                            description: "Apresentado por um avatar de IA" | "Presentado por un avatar de IA" | "Presented by an AI avatar";
                            position: string;
                            /** @enum {string} */
                            text: "AI" | "IA";
                            visible: boolean;
                        };
                        avatar: {
                            preset: null | string;
                            provider: string;
                            source: string;
                            synthetic: boolean;
                        };
                        disclosure: {
                            shownAtStart: boolean;
                            text: string;
                        };
                        now: null | {
                            line: string;
                            name: string;
                            photoUrl: null | string;
                            price: number;
                            productId: string;
                        };
                        products: {
                            name: string;
                            price: number;
                            productId: string;
                        }[];
                        rotateSec: number;
                        sessionId: string;
                        startedAt: null | string;
                        /** @enum {string} */
                        status: "draft" | "ended" | "live";
                        title: string;
                    };
                };
            };
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_live_consent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        acceptedAt: string;
                        consentId: string;
                        type: string;
                        version: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_live_consent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_live_sessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        consent: {
                            avatarLive: boolean;
                            version: string;
                        };
                        items: {
                            aiLabel: {
                                enabled: boolean;
                                impressions: number;
                                /** @enum {string} */
                                text: "AI" | "IA";
                                visible: boolean;
                            };
                            avatar: {
                                preset: null | string;
                                provider: string;
                                source: string;
                                voice: string;
                            };
                            catalogId: string;
                            createdAt: string;
                            disclosure: string;
                            endedAt: null | string;
                            merchantOptInAt: string;
                            sessionId: string;
                            startedAt: null | string;
                            /** @enum {string} */
                            status: "draft" | "ended" | "live";
                            title: string;
                            watchPath: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_live_sessions: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    aiLabelEnabled: boolean;
                    avatar: {
                        /** @enum {string} */
                        preset?: "ana" | "leo" | "bia";
                        /**
                         * @default preset
                         * @enum {string}
                         */
                        source?: "preset" | "custom";
                        /**
                         * @default female
                         * @enum {string}
                         */
                        voice?: "female" | "male" | "neutral";
                    };
                    /** Format: uuid */
                    catalogId: string;
                    /** @enum {string} */
                    locale?: "pt-BR" | "en" | "es";
                    merchantOptIn: boolean;
                    title: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiLabel: {
                            enabled: boolean;
                            impressions: number;
                            /** @enum {string} */
                            text: "AI" | "IA";
                            visible: boolean;
                        };
                        avatar: {
                            preset: null | string;
                            provider: string;
                            source: string;
                            voice: string;
                        };
                        catalogId: string;
                        createdAt: string;
                        disclosure: string;
                        endedAt: null | string;
                        merchantOptInAt: string;
                        sessionId: string;
                        startedAt: null | string;
                        /** @enum {string} */
                        status: "draft" | "ended" | "live";
                        title: string;
                        watchPath: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_live_sessions_sessionId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiLabel: {
                            enabled: boolean;
                            impressions: number;
                            /** @enum {string} */
                            text: "AI" | "IA";
                            visible: boolean;
                        };
                        avatar: {
                            preset: null | string;
                            provider: string;
                            source: string;
                            voice: string;
                        };
                        catalogId: string;
                        createdAt: string;
                        disclosure: string;
                        endedAt: null | string;
                        events: {
                            createdAt: string;
                            payload?: {
                                aiLabelEnabled?: boolean;
                                avatarSource?: string;
                                label?: string;
                                lines?: number;
                                merchantOptIn?: boolean;
                                products?: number;
                                provider?: string;
                                text?: string;
                            };
                            type: string;
                        }[];
                        merchantOptInAt: string;
                        sessionId: string;
                        startedAt: null | string;
                        /** @enum {string} */
                        status: "draft" | "ended" | "live";
                        title: string;
                        watchPath: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_live_sessions_sessionId_start: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiLabel: {
                            enabled: boolean;
                            impressions: number;
                            /** @enum {string} */
                            text: "AI" | "IA";
                            visible: boolean;
                        };
                        avatar: {
                            preset: null | string;
                            provider: string;
                            source: string;
                            voice: string;
                        };
                        catalogId: string;
                        createdAt: string;
                        disclosure: string;
                        disclosureShown: boolean;
                        endedAt: null | string;
                        merchantOptInAt: string;
                        sessionId: string;
                        startedAt: null | string;
                        /** @enum {string} */
                        status: "draft" | "ended" | "live";
                        title: string;
                        watchPath: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_live_sessions_sessionId_stop: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiLabel: {
                            enabled: boolean;
                            impressions: number;
                            /** @enum {string} */
                            text: "AI" | "IA";
                            visible: boolean;
                        };
                        avatar: {
                            preset: null | string;
                            provider: string;
                            source: string;
                            voice: string;
                        };
                        catalogId: string;
                        createdAt: string;
                        disclosure: string;
                        endedAt: null | string;
                        merchantOptInAt: string;
                        sessionId: string;
                        startedAt: null | string;
                        /** @enum {string} */
                        status: "draft" | "ended" | "live";
                        title: string;
                        watchPath: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_merges: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            createdAt: string;
                            durationSec: null | number;
                            mergeId: string;
                            progress: number;
                            projectAId: string;
                            projectBId: string;
                            resultProjectId: null | string;
                            stage: string;
                            status: string;
                            transition: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_merges_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        inputMaxSec: number;
                        maxSec: number;
                        messages: {
                            input_too_long: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            merge_failed: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            merge_forbidden: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            merge_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            same_project: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        transitions: string[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_metrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
            403: components["responses"]["Error"];
        };
    };
    post_monetization_paywall_evaluate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default false */
                    peek?: boolean;
                    /** @enum {string} */
                    trigger: "first_generation" | "third_generation" | "download_no_watermark" | "credits_exhausted" | "credits_80pct" | "third_platform_free" | "three_videos_day";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        blocking: false;
                        experiments?: {
                            [key: string]: {
                                inExperiment: boolean;
                                variant: string;
                            };
                        };
                        offer?: {
                            /** @enum {string} */
                            billing: "annual" | "monthly";
                            bundle?: {
                                bonusCredits: number;
                                /** @constant */
                                plan: "pro";
                                premiumTemplateId: null | string;
                            };
                            copy: {
                                body: string;
                                cta: string;
                                title: string;
                            };
                            /** @enum {string} */
                            kind: "bundle" | "credits" | "plan";
                            packId?: string;
                            /** @enum {string} */
                            plan?: "pro";
                            priceKey?: string;
                            quote: {
                                country: null | string;
                                credits?: number;
                                currency: string;
                                display: {
                                    iof: string;
                                    perMonth?: string;
                                    subtotal: string;
                                    tax: string;
                                    total: string;
                                };
                                iofMinor: number;
                                item: {
                                    /** @enum {string} */
                                    billing?: "annual" | "monthly";
                                    /** @constant */
                                    kind: "plan";
                                    /** @enum {string} */
                                    plan: "business" | "pro";
                                } | {
                                    /** @constant */
                                    kind: "credits";
                                    packId: string;
                                };
                                locale: string;
                                methods: string[];
                                netMinor: number;
                                region: string;
                                subtotalMinor: number;
                                tax: {
                                    inclusive: boolean;
                                    kind: string;
                                    pct: number;
                                };
                                taxMinor: number;
                                totalMinor: number;
                            };
                            trialDays?: number;
                        };
                        reason?: string;
                        show: boolean;
                        /** @enum {string} */
                        trigger: "credits_80pct" | "credits_exhausted" | "download_no_watermark" | "first_generation" | "third_generation" | "third_platform_free" | "three_videos_day";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_notifications: {
        parameters: {
            query?: {
                channel?: "push" | "email" | "in_app";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            actionTaken: null | string;
                            body: string;
                            channel: string;
                            deepLink: null | string;
                            id: string;
                            readAt: null | string;
                            /** Format: date-time */
                            sentAt: string;
                            title: string;
                        }[];
                        unread: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_notifications_id_action: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    action: "read" | "clicked" | "dismissed";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_notifications_preferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        email: boolean;
                        inApp: boolean;
                        preferredHour: null | number;
                        push: boolean;
                        quietEnd: number;
                        quietStart: number;
                        unsubscribedAll: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    put_notifications_preferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email?: boolean;
                    inApp?: boolean;
                    preferredHour?: number | unknown;
                    push?: boolean;
                    quietEnd?: number;
                    quietStart?: number;
                    unsubscribedAll?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        email: boolean;
                        inApp: boolean;
                        preferredHour: null | number;
                        push: boolean;
                        quietEnd: number;
                        quietStart: number;
                        unsubscribedAll: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_notifications_unsubscribe: {
        parameters: {
            query: {
                t: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        unsubscribed: boolean;
                    };
                };
            };
        };
    };
    post_notifications_unsubscribe: {
        parameters: {
            query: {
                t: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        unsubscribed: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_onboarding_plan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        completed: boolean;
                        /** @enum {string} */
                        goal: "audience" | "sell" | "test_ai";
                        goalSelected: boolean;
                        intro: {
                            count?: number;
                            durationSec?: number;
                            /** @enum {string} */
                            format: "slides" | "video";
                            url?: string;
                        };
                        nextStep: null | string;
                        steps: {
                            done: boolean;
                            id: string;
                            /** @enum {string} */
                            kind: "connect" | "create" | "learn" | "publish";
                            target?: string;
                            title: string;
                        }[];
                        variant: {
                            experiment: string;
                            inExperiment: boolean;
                            key: string;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_payouts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            amountCents: number;
                            awaitingSecondApproval: boolean;
                            gatewayRef: null | string;
                            holdReason: null | string;
                            id: string;
                            processedAt: null | string;
                            reason: null | string;
                            /** Format: date-time */
                            requestedAt: string;
                            source: string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_payouts: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    amountCents: number;
                    /** @enum {string} */
                    source: "affiliate" | "marketplace";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        amountCents: number;
                        awaitingSecondApproval: boolean;
                        gatewayRef: null | string;
                        holdReason: null | string;
                        id: string;
                        processedAt: null | string;
                        reason: null | string;
                        /** Format: date-time */
                        requestedAt: string;
                        source: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            402: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_pricing: {
        parameters: {
            query?: {
                country?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        creditPacks: {
                            country: null | string;
                            credits?: number;
                            currency: string;
                            display: {
                                iof: string;
                                perMonth?: string;
                                subtotal: string;
                                tax: string;
                                total: string;
                            };
                            iofMinor: number;
                            item: {
                                /** @enum {string} */
                                billing?: "annual" | "monthly";
                                /** @constant */
                                kind: "plan";
                                /** @enum {string} */
                                plan: "business" | "pro";
                            } | {
                                /** @constant */
                                kind: "credits";
                                packId: string;
                            };
                            locale: string;
                            methods: string[];
                            netMinor: number;
                            region: string;
                            subtotalMinor: number;
                            tax: {
                                inclusive: boolean;
                                kind: string;
                                pct: number;
                            };
                            taxMinor: number;
                            totalMinor: number;
                        }[];
                        currency: string;
                        locale: string;
                        methods: string[];
                        plans: {
                            business: {
                                annual: {
                                    country: null | string;
                                    credits?: number;
                                    currency: string;
                                    display: {
                                        iof: string;
                                        perMonth?: string;
                                        subtotal: string;
                                        tax: string;
                                        total: string;
                                    };
                                    iofMinor: number;
                                    item: {
                                        /** @enum {string} */
                                        billing?: "annual" | "monthly";
                                        /** @constant */
                                        kind: "plan";
                                        /** @enum {string} */
                                        plan: "business" | "pro";
                                    } | {
                                        /** @constant */
                                        kind: "credits";
                                        packId: string;
                                    };
                                    locale: string;
                                    methods: string[];
                                    netMinor: number;
                                    region: string;
                                    subtotalMinor: number;
                                    tax: {
                                        inclusive: boolean;
                                        kind: string;
                                        pct: number;
                                    };
                                    taxMinor: number;
                                    totalMinor: number;
                                };
                                monthly: {
                                    country: null | string;
                                    credits?: number;
                                    currency: string;
                                    display: {
                                        iof: string;
                                        perMonth?: string;
                                        subtotal: string;
                                        tax: string;
                                        total: string;
                                    };
                                    iofMinor: number;
                                    item: {
                                        /** @enum {string} */
                                        billing?: "annual" | "monthly";
                                        /** @constant */
                                        kind: "plan";
                                        /** @enum {string} */
                                        plan: "business" | "pro";
                                    } | {
                                        /** @constant */
                                        kind: "credits";
                                        packId: string;
                                    };
                                    locale: string;
                                    methods: string[];
                                    netMinor: number;
                                    region: string;
                                    subtotalMinor: number;
                                    tax: {
                                        inclusive: boolean;
                                        kind: string;
                                        pct: number;
                                    };
                                    taxMinor: number;
                                    totalMinor: number;
                                };
                            };
                            pro: {
                                annual: {
                                    country: null | string;
                                    credits?: number;
                                    currency: string;
                                    display: {
                                        iof: string;
                                        perMonth?: string;
                                        subtotal: string;
                                        tax: string;
                                        total: string;
                                    };
                                    iofMinor: number;
                                    item: {
                                        /** @enum {string} */
                                        billing?: "annual" | "monthly";
                                        /** @constant */
                                        kind: "plan";
                                        /** @enum {string} */
                                        plan: "business" | "pro";
                                    } | {
                                        /** @constant */
                                        kind: "credits";
                                        packId: string;
                                    };
                                    locale: string;
                                    methods: string[];
                                    netMinor: number;
                                    region: string;
                                    subtotalMinor: number;
                                    tax: {
                                        inclusive: boolean;
                                        kind: string;
                                        pct: number;
                                    };
                                    taxMinor: number;
                                    totalMinor: number;
                                };
                                monthly: {
                                    country: null | string;
                                    credits?: number;
                                    currency: string;
                                    display: {
                                        iof: string;
                                        perMonth?: string;
                                        subtotal: string;
                                        tax: string;
                                        total: string;
                                    };
                                    iofMinor: number;
                                    item: {
                                        /** @enum {string} */
                                        billing?: "annual" | "monthly";
                                        /** @constant */
                                        kind: "plan";
                                        /** @enum {string} */
                                        plan: "business" | "pro";
                                    } | {
                                        /** @constant */
                                        kind: "credits";
                                        packId: string;
                                    };
                                    locale: string;
                                    methods: string[];
                                    netMinor: number;
                                    region: string;
                                    subtotalMinor: number;
                                    tax: {
                                        inclusive: boolean;
                                        kind: string;
                                        pct: number;
                                    };
                                    taxMinor: number;
                                    totalMinor: number;
                                };
                            };
                        };
                        region: string;
                    };
                };
            };
        };
    };
    get_pricing_regions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        regions: {
                            countries: string[];
                            currency: string;
                            display: {
                                business: string;
                                packs: {
                                    credits: number;
                                    id: string;
                                    price: string;
                                }[];
                                pro: string;
                            };
                            locale: string;
                            methods: string[];
                            pppIndex: number;
                            region: string;
                            taxInclusive: boolean;
                            taxKind: string;
                            taxPct: number;
                        }[];
                    };
                };
            };
        };
    };
    get_projects: {
        parameters: {
            query?: {
                cursor?: string;
                limit?: number;
                status?: "draft" | "generating" | "ready" | "failed";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            category: null | string;
                            createdAt: string;
                            durationSec: null | number;
                            finalVideoUrl: null | string;
                            id: string;
                            photoRefs: string[];
                            scenes?: {
                                chainedFromSceneId: null | string;
                                consistency: null | number;
                                durationSec: number;
                                errorMessage: null | string;
                                id: string;
                                index: number;
                                insertedElements?: {
                                    action: string;
                                    description: string;
                                    mode?: string;
                                    status: string;
                                    type: string;
                                }[];
                                lastFrameUrl: null | string;
                                projectId: string;
                                prompt: string;
                                referenceImages: string[];
                                referenceMode: string;
                                retried: boolean;
                                status: string;
                                text: string;
                                videoUrl: null | string;
                            }[];
                            script: string;
                            sourceLocale: string;
                            status: string;
                            storyboardId: null | string;
                            templateId: null | string;
                            thumbnailUrl: null | string;
                            title: string;
                            userId: string;
                            versions: string[];
                        }[];
                        nextCursor: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_projects: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectCreate"];
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            402: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
            423: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_projects_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_projects_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
        };
    };
    patch_projects_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    category?: string;
                    script?: string;
                    title?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category: null | string;
                        createdAt: string;
                        durationSec: null | number;
                        finalVideoUrl: null | string;
                        id: string;
                        photoRefs: string[];
                        scenes?: {
                            chainedFromSceneId: null | string;
                            consistency: null | number;
                            durationSec: number;
                            errorMessage: null | string;
                            id: string;
                            index: number;
                            insertedElements?: {
                                action: string;
                                description: string;
                                mode?: string;
                                status: string;
                                type: string;
                            }[];
                            lastFrameUrl: null | string;
                            projectId: string;
                            prompt: string;
                            referenceImages: string[];
                            referenceMode: string;
                            retried: boolean;
                            status: string;
                            text: string;
                            videoUrl: null | string;
                        }[];
                        script: string;
                        sourceLocale: string;
                        status: string;
                        storyboardId: null | string;
                        templateId: null | string;
                        thumbnailUrl: null | string;
                        title: string;
                        userId: string;
                        versions: string[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_projects_id_assemble: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        jobId?: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    get_projects_id_audio_settings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        settings: null | {
                            captions: boolean;
                            music: {
                                trackId: null | string;
                                volume: number;
                            };
                            narration: {
                                /** @enum {string} */
                                mode: "none" | "recorded" | "tts";
                                recordingId?: string;
                                voiceId?: string;
                            };
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    put_projects_id_audio_settings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        settings: null | {
                            captions: boolean;
                            music: {
                                trackId: null | string;
                                volume: number;
                            };
                            narration: {
                                /** @enum {string} */
                                mode: "none" | "recorded" | "tts";
                                recordingId?: string;
                                voiceId?: string;
                            };
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_id_audio_mix: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default true */
                    ducking?: boolean;
                    /** @default {} */
                    gains?: {
                        /** @default 0.6 */
                        music?: number;
                        /** @default 0.8 */
                        sfx?: number;
                        /** @default 1 */
                        voice?: number;
                    };
                    /** Format: uuid */
                    musicTrackId: string;
                    /** @default [] */
                    sfxEvents?: {
                        gainDb?: number;
                        /** @enum {string} */
                        sfxId: "whoosh" | "pop" | "riser" | "impact" | "click" | "sparkle";
                        timestampSec: number;
                    }[];
                    /**
                     * @default {
                     *       "source": "original"
                     *     }
                     */
                    voice?: {
                        /**
                         * @default original
                         * @enum {string}
                         */
                        source?: "original" | "clone" | "none";
                        /** Format: uuid */
                        voiceModelId?: string;
                    };
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        audioVersionId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_id_audio_revert: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        activeVersionId: null | string;
                        items: {
                            active: boolean;
                            createdAt: string;
                            ducking: boolean;
                            errorCode: null | string;
                            gains: {
                                [key: string]: number;
                            };
                            id: string;
                            loudnessLufs: null | number;
                            mixedUrl: null | string;
                            musicTrackId: null | string;
                            sfxEvents: {
                                gainDb?: number;
                                sfxId: string;
                                timestampSec: number;
                            }[];
                            status: string;
                            stems: {
                                musicUrl: null | string;
                                sfxUrl: null | string;
                                voiceUrl: null | string;
                            };
                            targetLufs: number;
                            urlsExpireInSec: number;
                            videoUrl: null | string;
                            voiceSource: string;
                        }[];
                        originalVideoUrl: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_id_audio_sfx_suggestions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            reason: string;
                            sfxId: string;
                            timestampSec: number;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    get_projects_id_audio_versions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        activeVersionId: null | string;
                        items: {
                            active: boolean;
                            createdAt: string;
                            ducking: boolean;
                            errorCode: null | string;
                            gains: {
                                [key: string]: number;
                            };
                            id: string;
                            loudnessLufs: null | number;
                            mixedUrl: null | string;
                            musicTrackId: null | string;
                            sfxEvents: {
                                gainDb?: number;
                                sfxId: string;
                                timestampSec: number;
                            }[];
                            status: string;
                            stems: {
                                musicUrl: null | string;
                                sfxUrl: null | string;
                                voiceUrl: null | string;
                            };
                            targetLufs: number;
                            urlsExpireInSec: number;
                            videoUrl: null | string;
                            voiceSource: string;
                        }[];
                        originalVideoUrl: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_id_audio_versions_versionId_activate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                versionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        activeVersionId: null | string;
                        items: {
                            active: boolean;
                            createdAt: string;
                            ducking: boolean;
                            errorCode: null | string;
                            gains: {
                                [key: string]: number;
                            };
                            id: string;
                            loudnessLufs: null | number;
                            mixedUrl: null | string;
                            musicTrackId: null | string;
                            sfxEvents: {
                                gainDb?: number;
                                sfxId: string;
                                timestampSec: number;
                            }[];
                            status: string;
                            stems: {
                                musicUrl: null | string;
                                sfxUrl: null | string;
                                voiceUrl: null | string;
                            };
                            targetLufs: number;
                            urlsExpireInSec: number;
                            videoUrl: null | string;
                            voiceSource: string;
                        }[];
                        originalVideoUrl: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    post_projects_id_dub: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    targetLocales: ("pt-BR" | "en" | "es" | "es-MX")[];
                    /**
                     * @default {
                     *       "gender": "neutral"
                     *     }
                     */
                    voice?: {
                        /**
                         * @default neutral
                         * @enum {string}
                         */
                        gender?: "male" | "female" | "neutral";
                    };
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        creditsCharged: number;
                        jobs: {
                            jobId?: string;
                            locale: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            402: components["responses"]["Error"];
        };
    };
    get_projects_id_generation_logs: {
        parameters: {
            query?: {
                after?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            id: number;
                            message: string;
                            sceneId: null | string;
                            step: string;
                            /** Format: date-time */
                            timestamp: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_projects_id_localized_versions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            audioUrl: null | string;
                            /** Format: date-time */
                            createdAt: string;
                            locale: string;
                            status: string;
                            subtitlesUrl: null | string;
                            videoUrl: null | string;
                            voice: null | string;
                        }[];
                        sourceLocale: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_projects_id_scenes_sceneId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    durationSec?: number;
                    prompt?: string;
                    /** @enum {string} */
                    referenceMode?: "product" | "person" | "both";
                    text?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Scene"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_projects_id_scenes_sceneId_generate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        jobId?: string;
                        sceneId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            402: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    post_projects_id_scenes_sceneId_regenerate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        jobId?: string;
                        sceneId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    put_projects_id_sections: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sections: {
                            chainedFromSceneId: null | string;
                            consistency: null | number;
                            durationSec: number;
                            errorMessage: null | string;
                            id: string;
                            index: number;
                            insertedElements?: {
                                action: string;
                                description: string;
                                mode?: string;
                                status: string;
                                type: string;
                            }[];
                            lastFrameUrl: null | string;
                            projectId: string;
                            prompt: string;
                            referenceImages: string[];
                            referenceMode: string;
                            retried: boolean;
                            status: string;
                            text: string;
                            videoUrl: null | string;
                        }[];
                        split: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_id_storyboard: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    pipeline?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        jobId?: string;
                        projectId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            423: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_projects_projectId_accessibility: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            assetId: string;
                            createdAt: string;
                            descriptions?: unknown[];
                            errorCode: null | string;
                            expiresAt: null | string;
                            extraFileUrl: null | string;
                            fileUrl: null | string;
                            /** @enum {string} */
                            locale: "en" | "es" | "pt-BR";
                            projectId: string;
                            reviewed: boolean;
                            reviewedAt: null | string;
                            sha256: null | string;
                            signature: null | string;
                            status: string;
                            style: null | {
                                bold: boolean;
                                colors: {
                                    /** @enum {string} */
                                    box: "#000000" | "#1B1B1B";
                                    boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                    /** @enum {string} */
                                    highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                    /** @enum {string} */
                                    text: "#FFF8E7" | "#FFFFFF";
                                };
                                contrast: {
                                    highlight: number;
                                    text: number;
                                };
                                fontScale: number;
                                /** @enum {string} */
                                position: "bottom" | "top";
                                /** @enum {string} */
                                preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                                spacing: 0 | 2;
                            } | {
                                [key: string]: unknown;
                            };
                            type: string;
                            words?: {
                                end: number;
                                scene: number;
                                start: number;
                                w: string;
                            }[];
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_accessibility_audio_description: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    locale?: "pt-BR" | "en" | "es";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        createdAt: string;
                        descriptions?: unknown[];
                        errorCode: null | string;
                        expiresAt: null | string;
                        extraFileUrl: null | string;
                        fileUrl: null | string;
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        projectId: string;
                        reviewed: boolean;
                        reviewedAt: null | string;
                        sha256: null | string;
                        signature: null | string;
                        status: string;
                        style: null | {
                            bold: boolean;
                            colors: {
                                /** @enum {string} */
                                box: "#000000" | "#1B1B1B";
                                boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                /** @enum {string} */
                                highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                /** @enum {string} */
                                text: "#FFF8E7" | "#FFFFFF";
                            };
                            contrast: {
                                highlight: number;
                                text: number;
                            };
                            fontScale: number;
                            /** @enum {string} */
                            position: "bottom" | "top";
                            /** @enum {string} */
                            preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                            spacing: 0 | 2;
                        } | {
                            [key: string]: unknown;
                        };
                        type: string;
                        words?: {
                            end: number;
                            scene: number;
                            start: number;
                            w: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_accessibility_captions: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    locales: ("pt-BR" | "en" | "es")[];
                    style?: {
                        fontScale?: number;
                        /** @enum {string} */
                        position?: "bottom" | "top";
                        /** @enum {string} */
                        preset?: "padrao" | "alto_contraste" | "grande" | "dislexia";
                    };
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            assetId: string;
                            createdAt: string;
                            descriptions?: unknown[];
                            errorCode: null | string;
                            expiresAt: null | string;
                            extraFileUrl: null | string;
                            fileUrl: null | string;
                            /** @enum {string} */
                            locale: "en" | "es" | "pt-BR";
                            projectId: string;
                            reviewed: boolean;
                            reviewedAt: null | string;
                            sha256: null | string;
                            signature: null | string;
                            status: string;
                            style: null | {
                                bold: boolean;
                                colors: {
                                    /** @enum {string} */
                                    box: "#000000" | "#1B1B1B";
                                    boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                    /** @enum {string} */
                                    highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                    /** @enum {string} */
                                    text: "#FFF8E7" | "#FFFFFF";
                                };
                                contrast: {
                                    highlight: number;
                                    text: number;
                                };
                                fontScale: number;
                                /** @enum {string} */
                                position: "bottom" | "top";
                                /** @enum {string} */
                                preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                                spacing: 0 | 2;
                            } | {
                                [key: string]: unknown;
                            };
                            type: string;
                            words?: {
                                end: number;
                                scene: number;
                                start: number;
                                w: string;
                            }[];
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_accessibility_transcript: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    format: "srt" | "vtt" | "txt";
                    /** @enum {string} */
                    locale?: "pt-BR" | "en" | "es";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        createdAt: string;
                        descriptions?: unknown[];
                        errorCode: null | string;
                        expiresAt: null | string;
                        extraFileUrl: null | string;
                        fileUrl: null | string;
                        /** @enum {string} */
                        format: "srt" | "txt" | "vtt";
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        projectId: string;
                        reviewed: boolean;
                        reviewedAt: null | string;
                        sha256: null | string;
                        signature: null | string;
                        signatureAlgorithm: string;
                        status: string;
                        style: null | {
                            bold: boolean;
                            colors: {
                                /** @enum {string} */
                                box: "#000000" | "#1B1B1B";
                                boxAlpha: 1 | 0.75 | 0.9 | 0.85;
                                /** @enum {string} */
                                highlight: "#7DD3FC" | "#FFD60A" | "#FFFF00";
                                /** @enum {string} */
                                text: "#FFF8E7" | "#FFFFFF";
                            };
                            contrast: {
                                highlight: number;
                                text: number;
                            };
                            fontScale: number;
                            /** @enum {string} */
                            position: "bottom" | "top";
                            /** @enum {string} */
                            preset: "alto_contraste" | "dislexia" | "grande" | "padrao";
                            spacing: 0 | 2;
                        } | {
                            [key: string]: unknown;
                        };
                        type: string;
                        words?: {
                            end: number;
                            scene: number;
                            start: number;
                            w: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_agent_plan: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    command: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        applied: boolean;
                        appliedAt: null | string;
                        appliedBy: null | string;
                        command: string;
                        createdAt: string;
                        errorCode: null | string;
                        plan: {
                            estimatedDurationMs: number;
                            message: null | string;
                            requiresTranscript: boolean;
                            steps: {
                                endMs: number;
                                label: string;
                                startMs: number;
                                /** @enum {string} */
                                type: "cut" | "replace";
                            }[];
                            summary: string;
                            understood: boolean;
                        };
                        preview: null | {
                            affectedScenes: number[];
                            durationMs: number;
                            removedMs: number;
                            url: null | string;
                        };
                        projectId: string;
                        runId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_agent_runs: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            applied: boolean;
                            appliedAt: null | string;
                            appliedBy: null | string;
                            command: string;
                            createdAt: string;
                            errorCode: null | string;
                            plan: {
                                estimatedDurationMs: number;
                                message: null | string;
                                requiresTranscript: boolean;
                                steps: {
                                    endMs: number;
                                    label: string;
                                    startMs: number;
                                    /** @enum {string} */
                                    type: "cut" | "replace";
                                }[];
                                summary: string;
                                understood: boolean;
                            };
                            preview: null | {
                                affectedScenes: number[];
                                durationMs: number;
                                removedMs: number;
                                url: null | string;
                            };
                            projectId: string;
                            runId: string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_agent_runs_runId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                runId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        applied: boolean;
                        appliedAt: null | string;
                        appliedBy: null | string;
                        command: string;
                        createdAt: string;
                        errorCode: null | string;
                        plan: {
                            estimatedDurationMs: number;
                            message: null | string;
                            requiresTranscript: boolean;
                            steps: {
                                endMs: number;
                                label: string;
                                startMs: number;
                                /** @enum {string} */
                                type: "cut" | "replace";
                            }[];
                            summary: string;
                            understood: boolean;
                        };
                        preview: null | {
                            affectedScenes: number[];
                            durationMs: number;
                            removedMs: number;
                            url: null | string;
                        };
                        projectId: string;
                        runId: string;
                        status: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_projects_projectId_agent_runs_runId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                runId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    post_projects_projectId_agent_runs_runId_apply: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
                runId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    confirm?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        applied: boolean;
                        appliedAt: null | string;
                        appliedBy: null | string;
                        command: string;
                        createdAt: string;
                        derivedSceneIds: string[];
                        errorCode: null | string;
                        plan: {
                            estimatedDurationMs: number;
                            message: null | string;
                            requiresTranscript: boolean;
                            steps: {
                                endMs: number;
                                label: string;
                                startMs: number;
                                /** @enum {string} */
                                type: "cut" | "replace";
                            }[];
                            summary: string;
                            understood: boolean;
                        };
                        preview: null | {
                            affectedScenes: number[];
                            durationMs: number;
                            removedMs: number;
                            url: null | string;
                        };
                        projectId: string;
                        runId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_projects_projectId_agent_runs_runId_execute: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
                runId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        applied: boolean;
                        appliedAt: null | string;
                        appliedBy: null | string;
                        command: string;
                        createdAt: string;
                        errorCode: null | string;
                        plan: {
                            estimatedDurationMs: number;
                            message: null | string;
                            requiresTranscript: boolean;
                            steps: {
                                endMs: number;
                                label: string;
                                startMs: number;
                                /** @enum {string} */
                                type: "cut" | "replace";
                            }[];
                            summary: string;
                            understood: boolean;
                        };
                        preview: null | {
                            affectedScenes: number[];
                            durationMs: number;
                            removedMs: number;
                            url: null | string;
                        };
                        projectId: string;
                        runId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_assets: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    durationSec?: number;
                    /** @enum {string} */
                    format?: "mp4" | "webm";
                    profile?: string;
                    startSec?: number;
                    /** @enum {string} */
                    type: "gif" | "sticker" | "wallpaper" | "car" | "screensaver";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        assetId: string;
                        format: string;
                        profile: null | string;
                        status: string;
                        /** @enum {string} */
                        type: "car" | "gif" | "screensaver" | "sticker" | "wallpaper";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_collaborators: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        members: ({
                            name: string;
                            online: boolean;
                            /** @enum {string} */
                            role: "editor" | "owner" | "viewer";
                            since: null | string;
                            userId: string;
                        } | {
                            name: string;
                            online: boolean;
                            role: string;
                            userId: string;
                        })[];
                        /** @enum {string} */
                        myRole: "editor" | "owner" | "viewer";
                        pendingInvites: {
                            expiresAt: string;
                            inviteId: string;
                            /** @enum {string} */
                            role: "editor" | "owner" | "viewer";
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_collaborators: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /** @enum {string} */
                    role: "editor" | "viewer";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresAt: string;
                        inviteId: string;
                        link: string;
                        /** @enum {string} */
                        role: "editor" | "viewer";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_projects_projectId_collaborators_memberId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                memberId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_projects_projectId_collaborators_me: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_comments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            anonymized: boolean;
                            authorId: null | string;
                            authorName: null | string;
                            body: string;
                            clipId: null | string;
                            commentId: string;
                            createdAt: string;
                            resolved: boolean;
                            timeMs: number;
                            updatedAt: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_comments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    body: string;
                    /** Format: uuid */
                    clipId?: string;
                    timeMs: number;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        anonymized: boolean;
                        authorId: null | string;
                        authorName: null | string;
                        body: string;
                        clipId: null | string;
                        commentId: string;
                        createdAt: string;
                        resolved: boolean;
                        timeMs: number;
                        updatedAt: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_projects_projectId_comments_commentId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                commentId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    patch_projects_projectId_comments_commentId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                commentId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    body?: string;
                    resolved?: boolean;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        anonymized: boolean;
                        authorId: null | string;
                        authorName: null | string;
                        body: string;
                        clipId: null | string;
                        commentId: string;
                        createdAt: string;
                        resolved: boolean;
                        timeMs: number;
                        updatedAt: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_email: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    assetId?: string;
                    /** @default false */
                    includeSelf?: boolean;
                    message?: string;
                    password?: string;
                    /** @default [] */
                    recipients?: string[];
                    senderName?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresAt: string;
                        fileName: string;
                        hasPassword: boolean;
                        link: string;
                        recipients: number;
                        shareId: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_insights: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            createdAt: string;
                            /** @enum {string} */
                            disclaimer: "AI-generated estimate based on general short-video patterns. Not a guarantee of results." | "Estimación generada por IA a partir de patrones generales de videos cortos. No es garantía de resultados." | "Estimativa gerada por IA a partir de padrões gerais de vídeos curtos. Não é garantia de resultado.";
                            features: {
                                avgSceneSec: number;
                                ctaPresent: boolean;
                                durationSec: number;
                                hasMusic: boolean;
                                hookNumber: boolean;
                                hookQuestion: boolean;
                                hookWords: number;
                                localizedCount: number;
                                pastPublications: number;
                                pastSuccessRate: number;
                                sceneCount: number;
                                titleChars: number;
                                wordsPerSec: number;
                            };
                            isEstimate: boolean;
                            label: string;
                            modelVersion: string;
                            predictionId: string;
                            projectId: string;
                            scores: {
                                conversion: number;
                                ctr: number;
                                retention: number;
                            };
                            suggestions: {
                                /** @enum {string} */
                                code: "add_cta" | "add_music" | "faster_cuts" | "hook_question" | "lengthen_video" | "shorten_video" | "shorter_hook" | "slower_speech" | "title_length" | "translate";
                                impact: number;
                                metric: string;
                                params: {
                                    [key: string]: number;
                                };
                                text: string;
                            }[];
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_insights: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        /** @enum {string} */
                        disclaimer: "AI-generated estimate based on general short-video patterns. Not a guarantee of results." | "Estimación generada por IA a partir de patrones generales de videos cortos. No es garantía de resultados." | "Estimativa gerada por IA a partir de padrões gerais de vídeos curtos. Não é garantia de resultado.";
                        features: {
                            avgSceneSec: number;
                            ctaPresent: boolean;
                            durationSec: number;
                            hasMusic: boolean;
                            hookNumber: boolean;
                            hookQuestion: boolean;
                            hookWords: number;
                            localizedCount: number;
                            pastPublications: number;
                            pastSuccessRate: number;
                            sceneCount: number;
                            titleChars: number;
                            wordsPerSec: number;
                        };
                        isEstimate: boolean;
                        label: string;
                        modelVersion: string;
                        predictionId: string;
                        projectId: string;
                        scores: {
                            conversion: number;
                            ctr: number;
                            retention: number;
                        };
                        suggestions: {
                            /** @enum {string} */
                            code: "add_cta" | "add_music" | "faster_cuts" | "hook_question" | "lengthen_video" | "shorten_video" | "shorter_hook" | "slower_speech" | "title_length" | "translate";
                            impact: number;
                            metric: string;
                            params: {
                                [key: string]: number;
                            };
                            text: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_merge: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default this_first
                     * @enum {string}
                     */
                    order?: "this_first" | "other_first";
                    /** Format: uuid */
                    otherProjectId: string;
                    title?: string;
                    /**
                     * @default auto
                     * @enum {string}
                     */
                    transition?: "auto" | "fade" | "fadeblack" | "dissolve" | "slideleft" | "smoothleft" | "circleopen" | "zoomin";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        mergeId: string;
                        projectAId: string;
                        projectBId: string;
                        stage: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_merge_mergeId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mergeId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        durationSec: null | number;
                        errorCode: null | string;
                        loudnessLufs: null | number;
                        measures: null | Record<string, never>;
                        mergeId: string;
                        progress: number;
                        projectAId: string;
                        projectBId: string;
                        reason: null | string;
                        resultProjectId: null | string;
                        resultVideoUrl: null | string;
                        stage: string;
                        stages: [
                            "queued",
                            "normalize",
                            "analyze",
                            "transition",
                            "audio",
                            "finalize",
                            "done"
                        ];
                        status: string;
                        transition: null | string;
                        transitionRequested: string;
                        urlExpiresInSec: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_save: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    destination: "device" | "local_folder" | "icloud" | "nexus_cloud" | "google_drive" | "dropbox" | "onedrive";
                };
            };
        };
        responses: {
            /** @description Sucesso (alternativo) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        destination: string;
                        exportId: string;
                        retentionDays: number;
                        status: string;
                    } | {
                        /** @enum {string} */
                        destination: "dropbox" | "google_drive" | "onedrive";
                        exportId: string;
                        status: string;
                    } | {
                        /** @enum {string} */
                        destination: "device" | "icloud" | "local_folder";
                        exportId: string;
                        fileName: string;
                        /** @enum {string} */
                        flow: "folder" | "gallery" | "ios_files";
                        mime: string;
                        status: string;
                        url: string;
                        urlExpiresInSec: number;
                    };
                };
            };
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        destination: string;
                        exportId: string;
                        retentionDays: number;
                        status: string;
                    } | {
                        /** @enum {string} */
                        destination: "dropbox" | "google_drive" | "onedrive";
                        exportId: string;
                        status: string;
                    } | {
                        /** @enum {string} */
                        destination: "device" | "icloud" | "local_folder";
                        exportId: string;
                        fileName: string;
                        /** @enum {string} */
                        flow: "folder" | "gallery" | "ios_files";
                        mime: string;
                        status: string;
                        url: string;
                        urlExpiresInSec: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    patch_projects_projectId_scenes_sceneId_background: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default 16:9
                     * @enum {string}
                     */
                    aspect?: "16:9" | "9:16" | "1:1";
                    backgroundRef?: string;
                    fill?: string;
                    /** @enum {string} */
                    operation: "remove" | "replace" | "outpaint";
                    /** @default 0 */
                    photoIndex?: number;
                    prompt?: string;
                    /**
                     * @default video
                     * @enum {string}
                     */
                    target?: "video" | "photo";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        editId: string;
                        /** @enum {string} */
                        operation: "outpaint" | "remove" | "replace";
                        status: string;
                        /** @enum {string} */
                        target: "photo" | "video";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    put_projects_projectId_scenes_sceneId_current: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        currentSceneId: string;
                        index: number;
                        pending: {
                            createdAt: string;
                            errorCode: null | string;
                            id: string;
                            /** @enum {string} */
                            operation: "outpaint" | "remove" | "replace";
                            status: string;
                            /** @enum {string} */
                            target: "photo" | "video";
                        }[];
                        urlsExpireInSec: number;
                        versions: {
                            current: boolean;
                            derivedFromSceneId: null | string;
                            edit: null | {
                                alphaUrl: null | string;
                                aspect: ("16:9" | "1:1" | "9:16") | null;
                                createdAt: string;
                                id: string;
                                /** @enum {string} */
                                operation: "outpaint" | "remove" | "replace";
                                prompt: null | string;
                                /** @enum {string} */
                                target: "photo" | "video";
                            };
                            elements: {
                                action: string;
                                description: string;
                                insertionId?: string;
                                mode?: string;
                                referenceImageUrl: null | string;
                                resultUrl: null | string;
                                status: string;
                                type: string;
                            }[];
                            original: boolean;
                            photoUrls: (null | string)[];
                            sceneId: string;
                            version: number;
                            videoUrl: null | string;
                        }[];
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_scenes_sceneId_elements: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** @enum {string} */
                            action: "insert" | "replace";
                            createdAt: string;
                            derivedSceneId: null | string;
                            description: string;
                            errorCode: null | string;
                            id: string;
                            mode: null | string;
                            status: string;
                            type: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_scenes_sceneId_elements: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @constant */
                    action: "insert";
                    /** Format: uuid */
                    consentId?: string;
                    /** @default  */
                    description?: string;
                    /** @default 0 */
                    photoIndex?: number;
                    /**
                     * @default {
                     *       "x": 0.7,
                     *       "y": 0.75
                     *     }
                     */
                    position?: {
                        x: number;
                        y: number;
                    };
                    referenceRef?: string;
                    /** @default 0.35 */
                    scale?: number;
                    /**
                     * @default video
                     * @enum {string}
                     */
                    target?: "video" | "photo";
                    /** @enum {string} */
                    type: "person" | "animal" | "object";
                } | {
                    /** @constant */
                    action: "replace";
                    /** @default  */
                    description?: string;
                    /** @default 120 */
                    hue?: number;
                    /** @enum {string} */
                    mode: "recolor" | "remove";
                    /** @default 0 */
                    photoIndex?: number;
                    region?: {
                        h: number;
                        w: number;
                        x: number;
                        y: number;
                    };
                    /**
                     * @default video
                     * @enum {string}
                     */
                    target?: "video" | "photo";
                    /**
                     * @default object
                     * @enum {string}
                     */
                    type?: "person" | "animal" | "object";
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action: "insert" | "replace";
                        insertionId: string;
                        status: string;
                        /** @enum {string} */
                        type: "animal" | "object" | "person";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_scenes_sceneId_versions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                sceneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        currentSceneId: string;
                        index: number;
                        pending: {
                            createdAt: string;
                            errorCode: null | string;
                            id: string;
                            /** @enum {string} */
                            operation: "outpaint" | "remove" | "replace";
                            status: string;
                            /** @enum {string} */
                            target: "photo" | "video";
                        }[];
                        urlsExpireInSec: number;
                        versions: {
                            current: boolean;
                            derivedFromSceneId: null | string;
                            edit: null | {
                                alphaUrl: null | string;
                                aspect: ("16:9" | "1:1" | "9:16") | null;
                                createdAt: string;
                                id: string;
                                /** @enum {string} */
                                operation: "outpaint" | "remove" | "replace";
                                prompt: null | string;
                                /** @enum {string} */
                                target: "photo" | "video";
                            };
                            elements: {
                                action: string;
                                description: string;
                                insertionId?: string;
                                mode?: string;
                                referenceImageUrl: null | string;
                                resultUrl: null | string;
                                status: string;
                                type: string;
                            }[];
                            original: boolean;
                            photoUrls: (null | string)[];
                            sceneId: string;
                            version: number;
                            videoUrl: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_seal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        c2paManifestEmbedded: boolean;
                        createdAt: string;
                        downloadUrl: null | string;
                        errorCode: null | string;
                        projectId: string;
                        seal: null | {
                            aiGenerated: boolean;
                            c2pa: {
                                embedded: boolean;
                                manifestLabel: null | string;
                                verifyUrl: null | string;
                            };
                            humanDirected: boolean;
                            issuedAt: string;
                            kind: string;
                            signedBy: null | string;
                            text: {
                                /** @constant */
                                en: "AI with human direction";
                                /** @constant */
                                es: "IA con dirección humana";
                                /** @constant */
                                "pt-BR": "IA com direção humana";
                            };
                        };
                        sealId: string;
                        status: string;
                        verifyUrl: null | string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_seal: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        c2paManifestEmbedded: boolean;
                        createdAt: string;
                        downloadUrl: null | string;
                        errorCode: null | string;
                        projectId: string;
                        seal: null | {
                            aiGenerated: boolean;
                            c2pa: {
                                embedded: boolean;
                                manifestLabel: null | string;
                                verifyUrl: null | string;
                            };
                            humanDirected: boolean;
                            issuedAt: string;
                            kind: string;
                            signedBy: null | string;
                            text: {
                                /** @constant */
                                en: "AI with human direction";
                                /** @constant */
                                es: "IA con dirección humana";
                                /** @constant */
                                "pt-BR": "IA com direção humana";
                            };
                        };
                        sealId: string;
                        status: string;
                        verifyUrl: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_projects_projectId_seal_verify: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actions: string[];
                        embedded: boolean;
                        failures: string[];
                        manifestLabel: null | string;
                        manifestPresent: boolean;
                        seal: null | {
                            aiGenerated: boolean;
                            humanDirected: boolean;
                            kind: string;
                            text: {
                                [key: string]: string;
                            };
                        };
                        sealId: string;
                        signedAt: null | string;
                        signedBy: null | string;
                        /** @enum {string} */
                        state: "Invalid" | "Trusted" | "Valid" | "none";
                        trusted: boolean;
                        valid: boolean;
                        verifyUrl: null;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_timeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        durationMs: number;
                        maxMs: number;
                        previewUrl: null | string;
                        projectId: string;
                        rev: number;
                        /** @enum {string} */
                        role: "editor" | "owner" | "viewer";
                        title: string;
                        tracks: {
                            clips: {
                                durationMs: number;
                                id: string;
                                position: number;
                                projectId: string;
                                props: {
                                    [key: string]: unknown;
                                };
                                sourceRef: null | string;
                                startMs: number;
                                trackId: string;
                                version: number;
                            }[];
                            hidden: boolean;
                            id: string;
                            kind: string;
                            locked: boolean;
                            muted: boolean;
                            name: string;
                            opacity: number;
                            position: number;
                            projectId: string;
                            version: number;
                            volume: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_timeline_fork: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        kind: string;
                        snapshotId: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_timeline_history: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            at: string;
                            conflict: null | string;
                            kind: string;
                            rev: number;
                            userId: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_timeline_ops: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        conflict: "lww" | null;
                        entity?: {
                            clips?: {
                                /** Format: date-time */
                                createdAt?: string;
                                durationMs?: number;
                                /** Format: uuid */
                                id: string;
                                position: number;
                                /** Format: uuid */
                                projectId?: string;
                                props: {
                                    label: string;
                                };
                                sourceRef?: string;
                                startMs?: number;
                                /** Format: uuid */
                                trackId?: string;
                                /** Format: date-time */
                                updatedAt?: string;
                                /** Format: uuid */
                                updatedBy?: string;
                                version: number;
                            }[];
                            /** Format: date-time */
                            createdAt?: string;
                            durationMs?: number;
                            hidden?: boolean;
                            /** Format: uuid */
                            id: string;
                            kind?: string;
                            locked?: boolean;
                            muted?: boolean;
                            name?: string;
                            opacity?: number;
                            position?: number;
                            /** Format: uuid */
                            projectId?: string;
                            props?: {
                                label: string;
                            };
                            removed?: boolean;
                            sourceRef?: string;
                            startMs?: number;
                            /** Format: uuid */
                            trackId?: string;
                            /** Format: date-time */
                            updatedAt?: string;
                            /** Format: uuid */
                            updatedBy?: string;
                            version?: number;
                            volume?: number;
                        };
                        overwritten: null | {
                            [key: string]: unknown;
                        };
                        rev: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            423: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_timeline_snapshots: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            createdAt: string;
                            createdBy: null | string;
                            kind: string;
                            label: string;
                            rev: number;
                            snapshotId: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_timeline_snapshots: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    label?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        kind: string;
                        snapshotId: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_timeline_snapshots_snapshotId_restore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                snapshotId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rev: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_projects_projectId_transcript: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        errorCode: null | string;
                        status: string;
                        transcriptId: string;
                    } | {
                        durationMs: null | number;
                        expiresAt: string;
                        language: string;
                        outdated: boolean;
                        provider: null | string;
                        segments: {
                            end: number;
                            from: number;
                            scene: number;
                            start: number;
                            text: string;
                            to: number;
                        }[];
                        status: string;
                        transcriptId: string;
                        words: {
                            end: number;
                            i: number;
                            scene: number;
                            start: number;
                            w: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_transcript: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        retentionDays: number;
                        status: string;
                        transcriptId: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_projects_projectId_transcript_edits: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ops: ({
                        fromWord: number;
                        toWord: number;
                        /** @constant */
                        type: "delete";
                    } | {
                        fromWord: number;
                        text: string;
                        toWord: number;
                        /** @constant */
                        type: "replace";
                    })[];
                    /** Format: uuid */
                    transcriptId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        editId: string;
                        ops: {
                            endMs: number;
                            startMs: number;
                            /** @enum {string} */
                            type: "cut" | "replace";
                        }[];
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_projects_projectId_transcript_edits_editId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                editId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        affectedScenes: number[];
                        appliedAt: null | string;
                        durationMs: null | number;
                        editId: string;
                        errorCode: null | string;
                        ops: {
                            endMs: number;
                            startMs: number;
                            /** @enum {string} */
                            type: "cut" | "replace";
                        }[];
                        previewUrl: null | string;
                        removedMs: null | number;
                        status: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_projects_projectId_transcript_edits_editId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                editId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_projects_projectId_transcript_edits_editId_apply: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                editId: string;
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        derivedSceneIds: string[];
                        durationMs: number;
                        editId: string;
                        previousVideoKept: boolean;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    get_public_sitemap_xml: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
        };
    };
    get_public_templates_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
        };
    };
    get_publications: {
        parameters: {
            query?: {
                projectId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            createdAt: string;
                            error: null | string;
                            externalId: null | string;
                            externalUrl: null | string;
                            id: string;
                            locale: null | string;
                            /** @enum {string} */
                            platform: "instagram" | "mercadolivre" | "olx" | "shopee" | "temu" | "tiktok" | "youtube";
                            progress?: number;
                            projectId: string;
                            publishedAt: null | string;
                            retryCount: number;
                            stage?: string;
                            status: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_publications: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublicationCreate"];
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicationBatch"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            423: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_publications_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Publication"];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_publications_id_retry: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        jobId?: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            409: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    get_r_linkId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirecionamento */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_readyz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        checks: {
                            [key: string]: string;
                        };
                        status: string;
                    };
                };
            };
            503: components["responses"]["Error"];
        };
    };
    post_recommendations_events: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    events: {
                        /** @enum {string} */
                        action: "impression" | "click" | "use" | "purchase";
                        /** @default {} */
                        context?: {
                            [key: string]: string | number | boolean;
                        };
                        itemId: string;
                        /** @enum {string} */
                        itemType: "template" | "prompt" | "platform" | "publish_time" | "photo_idea";
                        position?: number;
                        /** Format: uuid */
                        requestId?: string;
                        surface: string;
                        variant?: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recorded: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_recommendations_photo_ideas: {
        parameters: {
            query?: {
                category?: string;
                limit?: number;
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        avgPhotosPerProject: number;
                        category: string;
                        items: {
                            category: string;
                            id: string;
                            position: number;
                            reused: boolean;
                            score: number;
                            /** @enum {string} */
                            tag: "angle" | "background" | "context" | "detail" | "light";
                            text: string;
                        }[];
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        requestId: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_recommendations_platforms: {
        parameters: {
            query?: {
                category?: string;
                goal?: "sell" | "audience" | "test_ai";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category: null | string;
                        /** @enum {string} */
                        goal: "audience" | "sell" | "test_ai";
                        items: {
                            basis: string;
                            connected: boolean;
                            needsConnection: boolean;
                            /** @enum {string} */
                            platform: "instagram" | "mercadolivre" | "olx" | "shopee" | "temu" | "tiktok" | "youtube";
                            position: number;
                            score: number;
                            successRate: number;
                        }[];
                        requestId: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_recommendations_prompts: {
        parameters: {
            query?: {
                category?: string;
                limit?: number;
                locale?: "pt-BR" | "en" | "es";
                objective?: "sell" | "audience" | "test_ai";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category: string;
                        items: {
                            category: string;
                            id: string;
                            /** @enum {string} */
                            objective: "any" | "audience" | "sell" | "test_ai";
                            position: number;
                            score: number;
                            text: string;
                        }[];
                        /** @enum {string} */
                        locale: "en" | "es" | "pt-BR";
                        /** @enum {string} */
                        objective: "audience" | "sell" | "test_ai";
                        requestId: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_recommendations_publish_time: {
        parameters: {
            query: {
                platform: "tiktok" | "youtube" | "instagram" | "shopee" | "temu" | "olx" | "mercadolivre";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        basis: "cohort" | "prior" | "user";
                        /** @enum {string} */
                        platform: "instagram" | "mercadolivre" | "olx" | "shopee" | "temu" | "tiktok" | "youtube";
                        requestId: string;
                        slots: {
                            dow: number;
                            hour: number;
                            nextAt: string;
                            score: number;
                        }[];
                        timezone: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_recommendations_templates: {
        parameters: {
            query?: {
                category?: string;
                limit?: number;
                surface?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        experiment: {
                            inExperiment: boolean;
                            key: string;
                            variant: string;
                        };
                        interactions: number;
                        items: {
                            category: string;
                            id: string;
                            name: string;
                            position: number;
                            priceCredits: number;
                            reasons: string[];
                            score: number;
                        }[];
                        minInteractionsForPersonalized: number;
                        mode: string;
                        requestId: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_ref_code: {
        parameters: {
            query?: {
                device?: string;
                landing?: string;
                referrer?: string;
                utm_campaign?: string;
                utm_content?: string;
                utm_medium?: string;
                utm_source?: string;
                utm_term?: string;
            };
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirecionamento */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    post_referrals_click: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    deviceId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        clickId: null | string;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    post_referrals_convert: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    clickId?: string;
                    code: string;
                    deviceId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "signed_up";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_referrals_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        apiLink: string;
                        code: string;
                        link: string;
                        monthlyCap: number;
                        rewardedThisMonth: number;
                        rewards: {
                            referredCredits: number;
                            referrerCredits: number;
                        };
                        stats: {
                            activated: number;
                            clicks: number;
                            creditsEarned: number;
                            rewarded: number;
                            signups: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_s_token: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresAt: string;
                        fileName: null | string;
                        locale: string;
                        message: string;
                        needsPassword: boolean;
                        senderName: string;
                    };
                };
            };
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_s_token_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso (alternativo) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignedDownload"];
                };
            };
            /** @description Sucesso */
            303: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignedDownload"];
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_s_token_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso (alternativo) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignedDownload"];
                };
            };
            /** @description Sucesso */
            303: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignedDownload"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_save_batches_batchId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                batchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchId: string;
                        /** @enum {string} */
                        destination: "device" | "dropbox" | "google_drive" | "icloud" | "local_folder" | "nexus_cloud" | "onedrive";
                        done: number;
                        failed: number;
                        items: {
                            batchId: null | string;
                            bytes: null | number;
                            catalogItemId: null | string;
                            createdAt: string;
                            /** @enum {string} */
                            destination: "device" | "dropbox" | "google_drive" | "icloud" | "local_folder" | "nexus_cloud" | "onedrive";
                            errorCode: null | string;
                            expiresAt: null | string;
                            exportId: string;
                            externalUrl: null | string;
                            fileName: null | string;
                            /** @enum {string} */
                            kind: "video" | "zip";
                            projectId: null | string;
                            status: string;
                            url: null | string;
                            urlExpiresInSec: null | number;
                        }[];
                        pending: number;
                        total: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_save_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchDestinations: [
                            "device",
                            "nexus_cloud",
                            "google_drive",
                            "dropbox",
                            "onedrive"
                        ];
                        batchMaxItems: number;
                        connections: {
                            available: boolean;
                            connectedAt: null | string;
                            /** @enum {string} */
                            provider: "dropbox" | "google_drive" | "onedrive";
                            scopes: string[];
                            status: string;
                        }[];
                        destinations: [
                            "device",
                            "local_folder",
                            "icloud",
                            "nexus_cloud",
                            "google_drive",
                            "dropbox",
                            "onedrive"
                        ];
                        deviceLinkTtlSec: number;
                        messages: {
                            batch_empty: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            catalog_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            cloud_not_configured: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            cloud_not_connected: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            cloud_reauth_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            cloud_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            connection_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            export_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            file_too_large: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            nexus_quota_exceeded: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            oauth_denied: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            oauth_state_invalid: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            save_failed: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            scope_too_broad: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        nexusCloud: {
                            quotaBytes: number;
                            retentionByPlan: {
                                free: number;
                                pro: number;
                            };
                            retentionDays: number;
                            usedBytes: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_save_exports: {
        parameters: {
            query?: {
                destination?: "device" | "local_folder" | "icloud" | "nexus_cloud" | "google_drive" | "dropbox" | "onedrive";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            batchId: null | string;
                            bytes: null | number;
                            catalogItemId: null | string;
                            createdAt: string;
                            /** @enum {string} */
                            destination: "device" | "dropbox" | "google_drive" | "icloud" | "local_folder" | "nexus_cloud" | "onedrive";
                            errorCode: null | string;
                            expiresAt: null | string;
                            exportId: string;
                            externalUrl: null | string;
                            fileName: null | string;
                            /** @enum {string} */
                            kind: "video" | "zip";
                            projectId: null | string;
                            status: string;
                            url: null | string;
                            urlExpiresInSec: null | number;
                        }[];
                        nexusCloud: {
                            quotaBytes: number;
                            retentionDays: number;
                            usedBytes: number;
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_save_exports_exportId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchId: null | string;
                        bytes: null | number;
                        catalogItemId: null | string;
                        createdAt: string;
                        /** @enum {string} */
                        destination: "device" | "dropbox" | "google_drive" | "icloud" | "local_folder" | "nexus_cloud" | "onedrive";
                        errorCode: null | string;
                        expiresAt: null | string;
                        exportId: string;
                        externalUrl: null | string;
                        fileName: null | string;
                        /** @enum {string} */
                        kind: "video" | "zip";
                        projectId: null | string;
                        status: string;
                        url: null | string;
                        urlExpiresInSec: null | number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_save_exports_exportId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    get_seal_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        configured: boolean;
                        embedded: boolean;
                        signer: null | string;
                        text: {
                            /** @constant */
                            en: "AI with human direction";
                            /** @constant */
                            es: "IA con dirección humana";
                            /** @constant */
                            "pt-BR": "IA com direção humana";
                        };
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_seal_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actions: string[];
                        embedded: boolean;
                        failures: string[];
                        manifestLabel: null | string;
                        manifestPresent: boolean;
                        seal: null | {
                            aiGenerated: boolean;
                            humanDirected: boolean;
                            kind: string;
                            text: {
                                [key: string]: string;
                            };
                        };
                        signedAt: null | string;
                        signedBy: null | string;
                        /** @enum {string} */
                        state: "Invalid" | "Trusted" | "Valid" | "none";
                        trusted: boolean;
                        valid: boolean;
                        verifyUrl: null;
                    };
                };
            };
            400: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_series: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            episodeCount: number;
                            seriesId: string;
                            /** @enum {string} */
                            template: "lancamento" | "livre" | "mininovela" | "tutorial";
                            title: string;
                            updatedAt: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_series: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    description?: string;
                    /** @enum {string} */
                    template?: "mininovela" | "tutorial" | "lancamento" | "livre";
                    title: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_series_seriesId: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path: {
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_series_seriesId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_series_seriesId_episodes: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ctaLabel?: string;
                    ctaUrl?: string;
                    /** Format: uuid */
                    projectId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    delete_series_seriesId_episodes_episodeId: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path: {
                episodeId: string;
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    patch_series_seriesId_episodes_episodeId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                episodeId: string;
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    put_series_seriesId_episodes_order: {
        parameters: {
            query?: {
                locale?: "pt-BR" | "en" | "es";
            };
            header?: never;
            path: {
                seriesId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    episodeIds: string[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        description: string;
                        episodeCount: number;
                        episodes: {
                            cta: {
                                kind: string;
                                label: null | string;
                                url: null | string;
                            };
                            durationSec: null | number;
                            episodeId: string;
                            nextEpisodeId: null | string;
                            order: number;
                            prevEpisodeId: null | string;
                            projectId: string;
                            ready: boolean;
                            recap: null | string;
                            title: string;
                        }[];
                        seriesId: string;
                        /** @enum {string} */
                        template: "lancamento" | "livre" | "mininovela" | "tutorial";
                        title: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        activeIncidents: {
                            components: string[];
                            id: string;
                            severity: string;
                            /** Format: date-time */
                            startedAt: string;
                            status: string;
                            title: string;
                            updates: {
                                /** Format: date-time */
                                at: string;
                                message: string;
                                status: string;
                            }[];
                        }[];
                        components: {
                            key: string;
                            name: string;
                            status: string;
                        }[];
                        history: {
                            components: string[];
                            id: string;
                            resolvedAt: null | string;
                            severity: string;
                            /** Format: date-time */
                            startedAt: string;
                            status: string;
                            title: string;
                        }[];
                        overall?: string;
                        page: string;
                        updatedAt: string;
                    };
                };
            };
        };
    };
    get_status_rss: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
        };
    };
    get_status_confirm_token: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        confirmed: boolean;
                    };
                };
            };
        };
    };
    post_status_subscribe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    channel: "email" | "sms";
                    /** @default [] */
                    components?: string[];
                    target: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        confirmation: string;
                        subscribed: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_teleprompter_sessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            createdAt: string;
                            estimatedSec: number;
                            projectId: null | string;
                            recording: {
                                bytes: number;
                                mime: null | string;
                                uploaded: boolean;
                                uploadOptInAt: null | string;
                                url: string;
                            } | {
                                storedOn: string;
                                uploaded: boolean;
                            };
                            script: string;
                            sessionId: string;
                            settings: {
                                countdownSec: number;
                                fontScale: number;
                                guide: boolean;
                                mirror: boolean;
                                wpm: number;
                            };
                            words: number;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_teleprompter_sessions: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    projectId?: string;
                    script: string;
                    settings?: {
                        /** @default 3 */
                        countdownSec?: number;
                        /** @default 1.6 */
                        fontScale?: number;
                        /** @default true */
                        guide?: boolean;
                        /** @default false */
                        mirror?: boolean;
                        /** @default 130 */
                        wpm?: number;
                    };
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        estimatedSec: number;
                        projectId: null | string;
                        recording: {
                            bytes: number;
                            mime: null | string;
                            uploaded: boolean;
                            uploadOptInAt: null | string;
                            url: string;
                        } | {
                            storedOn: string;
                            uploaded: boolean;
                        };
                        script: string;
                        sessionId: string;
                        settings: {
                            countdownSec: number;
                            fontScale: number;
                            guide: boolean;
                            mirror: boolean;
                            wpm: number;
                        };
                        words: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_teleprompter_sessions_sessionId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        estimatedSec: number;
                        projectId: null | string;
                        recording: {
                            bytes: number;
                            mime: null | string;
                            uploaded: boolean;
                            uploadOptInAt: null | string;
                            url: string;
                        } | {
                            storedOn: string;
                            uploaded: boolean;
                        };
                        script: string;
                        sessionId: string;
                        settings: {
                            countdownSec: number;
                            fontScale: number;
                            guide: boolean;
                            mirror: boolean;
                            wpm: number;
                        };
                        words: number;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    delete_teleprompter_sessions_sessionId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sem conteúdo */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_teleprompter_sessions_sessionId_recording: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        createdAt: string;
                        estimatedSec: number;
                        projectId: null | string;
                        recording: {
                            bytes: number;
                            mime: null | string;
                            uploaded: boolean;
                            uploadOptInAt: null | string;
                            url: string;
                        } | {
                            storedOn: string;
                            uploaded: boolean;
                        };
                        script: string;
                        sessionId: string;
                        settings: {
                            countdownSec: number;
                            fontScale: number;
                            guide: boolean;
                            mirror: boolean;
                            wpm: number;
                        };
                        words: number;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_templates: {
        parameters: {
            query?: {
                category?: string;
                cursor?: string;
                limit?: number;
                search?: string;
                sort?: "popular" | "new" | "rating" | "price";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            captionStyle: null | string;
                            category: string;
                            /** Format: date-time */
                            createdAt: string;
                            creatorId: string;
                            description: string;
                            id: string;
                            locale: string;
                            name: string;
                            owned?: boolean;
                            previewUrl: null | string;
                            priceCredits: number;
                            promptHints: string[];
                            ratingAvg: number;
                            ratingCount: number;
                            rejectionReason: null | string;
                            sceneStructure?: {
                                durationSec: number;
                                text?: string;
                            }[];
                            status: string;
                            tags: string[];
                            trackId: null | string;
                            usageCount: number;
                            voiceId: null | string;
                        }[];
                        nextCursor: null | string;
                    };
                };
            };
        };
    };
    post_templates: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TemplateInput"];
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Template"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_templates_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Template"];
                };
            };
        };
    };
    delete_templates_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deleted: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_templates_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    captionStyle?: string;
                    category?: string;
                    description?: string;
                    /** @enum {string} */
                    locale?: "pt-BR" | "en" | "es" | "es-MX";
                    name?: string;
                    priceCredits?: number;
                    promptHints?: string[];
                    sceneStructure?: ({
                        durationSec: number;
                        hint?: string;
                        kind?: string;
                        title?: string;
                    } & {
                        [key: string]: unknown;
                    })[];
                    tags?: string[];
                    trackId?: string;
                    voiceId?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Template"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_templates_id_purchase: {
        parameters: {
            query?: never;
            header: {
                /** @description Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422. */
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alreadyOwned: boolean;
                        priceCredits: number;
                        purchased: boolean;
                    } | {
                        alreadyOwned: boolean;
                        creatorEarningsCents: number;
                        creatorShareCredits: number;
                        feeCredits: number;
                        priceCredits?: number;
                        purchased: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            402: components["responses"]["Error"];
            409: components["responses"]["Error"];
        };
    };
    post_templates_id_reviews: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default  */
                    comment?: string;
                    stars: number;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_templates_mine: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            captionStyle: null | string;
                            category: string;
                            /** Format: date-time */
                            createdAt: string;
                            creatorId: string;
                            description: string;
                            id: string;
                            locale: string;
                            name: string;
                            owned?: boolean;
                            previewUrl: null | string;
                            priceCredits: number;
                            promptHints: string[];
                            ratingAvg: number;
                            ratingCount: number;
                            rejectionReason: null | string;
                            sceneStructure?: unknown[];
                            status: string;
                            tags: string[];
                            trackId: null | string;
                            usageCount: number;
                            voiceId: null | string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_templates_revenue: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        balanceCents: number;
                        earnedCents: number;
                        earnedCredits: number;
                        platformFeeCredits: number;
                        platformFeePct: number;
                        sales: number;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_transcript_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        limits: {
                            transcribePerHour: number;
                        };
                        messages: {
                            already_applied: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            confirmation_required: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            edit_failed: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            edit_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            edit_not_ready: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            invalid_range: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            overlapping_edits: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            plan_empty: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            project_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            run_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            source_changed: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            stt_unavailable: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            too_short: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            transcript_not_found: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            transcript_outdated: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                            video_not_assembled: {
                                en: string;
                                es: string;
                                "pt-BR": string;
                            };
                        };
                        /** @enum {string} */
                        provider: "deepgram" | "mock" | "openai" | "whisper";
                        retentionDays: number;
                        trainingOptOut: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
            404: components["responses"]["Error"];
        };
    };
    post_uploads_confirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bytes: number;
                        mime: ("image/jpeg" | "image/png" | "image/webp" | "video/mp4") | null;
                        ref: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    put_uploads_photo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bytes: number;
                        mime: string;
                        ref: string;
                        url: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_uploads_presign: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        expiresInSec: number;
                        ref: string;
                        uploadUrl: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_users_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    patch_users_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPatch"];
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_users_me_consents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            acceptedAt: string;
                            active: boolean;
                            id: string;
                            revokedAt: null | string;
                            type: string;
                            version: string;
                        }[];
                        version: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_users_me_consents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    items: {
                        accepted: boolean;
                        /** @enum {string} */
                        type: "cookies" | "ai" | "marketing" | "terms";
                        version?: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** Format: date-time */
                            acceptedAt: string;
                            active: boolean;
                            id: string;
                            revokedAt: null | string;
                            type: string;
                            version: string;
                        }[];
                        version: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_users_me_deletion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** Format: date-time */
                        scheduledFor: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    delete_users_me_deletion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cancelled: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_users_me_export: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** Format: date-time */
                        requestedAt: string;
                        status: string;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_users_me_export_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        downloadUrl?: string;
                        expiresAt: null | string;
                        id: string;
                        /** Format: date-time */
                        requestedAt: string;
                        status: string;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_users_me_i18n_profile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aiRegulation: string[];
                        country: string;
                        culturalNotes: string[];
                        dominantPlatforms: string[];
                        dsarDays: null | number;
                        language: string;
                        locale: string;
                        musicPackIds: string[];
                        payments: {
                            currency: string;
                            invoiceRequired: boolean;
                            methods: string[];
                            taxName: string;
                            taxPct: null | number;
                        };
                        /** @enum {string} */
                        residency: "BR" | "CA" | "EU" | "US";
                        rtl: boolean;
                        support: {
                            channels: string[];
                            firstResponseSlaHours: number;
                            hours: string;
                            language: string;
                        };
                        videoFormats: string[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    get_users_me_kyc: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        kycStatus: string;
                        sanctionsCleared: boolean;
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_users_me_kyc: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    documentType: "passport" | "national_id" | "driver_license" | "cnpj";
                    externalRef: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** @enum {string} */
                        status: "pending" | "rejected" | "verified";
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    put_users_me_onboarding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    completed?: boolean;
                    country?: string;
                    durationMs?: number;
                    /** @enum {string} */
                    goal?: "sell" | "audience" | "test_ai";
                    stepsSeen?: number;
                    timezone?: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        completed: boolean;
                        /** @enum {string} */
                        goal: "audience" | "sell" | "test_ai";
                        goalSelected: boolean;
                        intro: {
                            count?: number;
                            durationSec?: number;
                            /** @enum {string} */
                            format: "slides" | "video";
                            url?: string;
                        };
                        nextStep: null | string;
                        steps: {
                            done: boolean;
                            id: string;
                            /** @enum {string} */
                            kind: "connect" | "create" | "learn" | "publish";
                            target?: string;
                            title: string;
                        }[];
                        variant: {
                            experiment: string;
                            inExperiment: boolean;
                            key: string;
                        };
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    get_users_me_residency: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        analytics: string;
                        cloudRegion: string;
                        country: null | string;
                        /** @enum {string} */
                        region: "BR" | "CA" | "EU" | "US";
                        routes: {
                            dataType: string;
                            provider: string;
                            storageRegion: string;
                        }[];
                    };
                };
            };
            401: components["responses"]["Error"];
        };
    };
    post_waitlist: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    anonId?: string;
                    country?: string;
                    /** Format: email */
                    email: string;
                    /**
                     * @default pt-BR
                     * @enum {string}
                     */
                    locale?: "pt-BR" | "en" | "es" | "es-MX";
                    ref?: string;
                    utm?: {
                        landing?: string;
                        referrer?: string;
                        utm_campaign?: string;
                        utm_content?: string;
                        utm_medium?: string;
                        utm_source?: string;
                        utm_term?: string;
                    };
                };
            };
        };
        responses: {
            /** @description Sucesso */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alreadyJoined: boolean;
                        statusSentByEmail: boolean;
                    } | {
                        alreadyJoined: boolean;
                        bonusPositions: number;
                        position: number;
                        referralCode: string;
                        referrals: number;
                        shareLink: string;
                        total: number;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    get_waitlist_code: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bonusPositions: number;
                        position: number;
                        referralCode: string;
                        referrals: number;
                        shareLink: string;
                        total: number;
                    };
                };
            };
        };
    };
    post_webhooks_affiliates_conversion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    amountCents: number;
                    /** Format: uuid */
                    linkId: string;
                    orderId: string;
                };
            };
        };
        responses: {
            /** @description Sucesso */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accepted: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_webhooks_local: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        duplicate: boolean;
                        received: boolean;
                    } | {
                        duplicate: boolean;
                        ignored: boolean;
                        received: boolean;
                    } | {
                        duplicate: boolean;
                        granted: boolean;
                        received: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
        };
    };
    post_webhooks_pix: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        duplicate: boolean;
                        received: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    post_webhooks_stripe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        duplicate: boolean;
                        received: boolean;
                    };
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
}
