# Propriedade intelectual e open source

> Versão 1.0 — revisão jurídica pendente. Complementa `docs/GOVERNANCE/IP.md`.

- **Licenças permitidas** em dependências de produção: MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, CC0, BlueOak, MPL-2.0 (uso como biblioteca). **Proibidas sem exceção aprovada:** GPL/AGPL/SSPL/BUSL/Commons Clause/CC-BY-NC. Verificação automática: `npm run audit:licenses` (falha o CI se houver proibida); exceções em `docs/GOVERNANCE/license-exceptions.json`, revisadas por Engenharia + Jurídico.
- **SBOM** CycloneDX gerado a cada release (`npm run audit:sbom` → data room).
- **Contribuições:** código escrito por colaboradores é da empresa (cláusula contratual); contribuições a projetos externos exigem aprovação.
- **Segredos comerciais:** NDA com terceiros (`docs/legal/NDA.md`); acesso por necessidade.
- **Marcas e domínios:** registrar nexusreel nas classes relevantes (pendente — busca de anterioridade não realizada).
