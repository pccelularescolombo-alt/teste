        // ============================
        // CONFIGURAÇÃO FIREBASE
        // ============================
        const firebaseConfig = {
            apiKey: "AIzaSyCb3gYoh9T2wUuRXF486lFmcYz75mIfJeo",
            authDomain: "metas-loja-60456.firebaseapp.com",
            projectId: "metas-loja-60456",
            storageBucket: "metas-loja-60456.firebasestorage.app",
            messagingSenderId: "437882305073",
            appId: "1:437882305073:web:68c9ec94461b1abf53f310"
        };

        // Inicializar Firebase
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // Configurações e dados iniciais
        const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        const SENHA_SISTEMA = "admin123";
        const DIAS_LIMPEZA_AUTOMATICA = 180;

        let metaCashback = 100;
        let metaAvaliacoes = 15;
        let vendedores = [];
        let registros = [];
        let tarefas = [];
        let afazeresCadastrados = [];
        let lojaNome = 'Minha Loja';
        let avulsasTemp = [];
        let gerenciarDesbloqueado = false;
        let tarefasDesbloqueado = false;
        let dadosCarregados = false;
        let afazeresSelecionados = new Set(); // Track selected afazeres across re-renders
        let observacoes = []; // Observações do relatório por data
        let funcionarioStatus = []; // Status do funcionário por dia: { id, data, vendedorId, status: 'falta'|'atestado' }

        // ============================
        // UI helpers (toast + confirm)
        // ============================
        function showToast(msg, type = 'success') {
            const c = document.getElementById('toastContainer');
            if (!c) return;
            const t = document.createElement('div');
            t.className = 'toast ' + type;
            t.textContent = msg;
            c.appendChild(t);
            setTimeout(() => {
                t.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                t.style.opacity = '0';
                t.style.transform = 'translateX(20px)';
                setTimeout(() => t.remove(), 300);
            }, 2600);
        }

        let _confirmResolve = null;
        function customConfirm(message, title = 'Confirmar') {
            return new Promise((resolve) => {
                _confirmResolve = resolve;
                document.getElementById('confirmTitle').textContent = title;
                document.getElementById('confirmMessage').textContent = message;
                document.getElementById('confirmModal').classList.add('active');
            });
        }
        function closeConfirm(result) {
            document.getElementById('confirmModal').classList.remove('active');
            if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
        }

        // ============================
        // FUNÇÕES FIRESTORE
        // ============================
        
        // Carregar todos os dados do Firestore
        async function carregarDados() {
            try {
                // Carregar configurações (loja, metas)
                const configDoc = await db.collection('configuracoes').doc('sistema').get();
                if (configDoc.exists) {
                    const config = configDoc.data();
                    lojaNome = config.lojaNome || 'Minha Loja';
                    metaCashback = config.metaCashback || 100;
                    metaAvaliacoes = config.metaAvaliacoes || 15;
                }

                // Carregar vendedores
                const vendedoresSnapshot = await db.collection('vendedores').get();
                if (vendedoresSnapshot.empty) {
                    // Criar vendedores iniciais
                    vendedores = [
                        { id: 1, nome: 'Mattheus', cor: '#3498db', icone: 'fa-user-tie' },
                        { id: 2, nome: 'Kelly', cor: '#e74c3c', icone: 'fa-user-ninja' },
                        { id: 3, nome: 'Miguel', cor: '#2ecc71', icone: 'fa-user-astronaut' },
                        { id: 4, nome: 'Allyson', cor: '#f39c12', icone: 'fa-user-secret' }
                    ];
                    await salvarVendedores();
                } else {
                    vendedores = vendedoresSnapshot.docs.map(doc => ({
                        id: doc.data().id,
                        nome: doc.data().nome,
                        cor: doc.data().cor,
                        icone: doc.data().icone
                    }));
                }

                // Carregar registros
                const registrosSnapshot = await db.collection('registros').get();
                registros = registrosSnapshot.docs.map(doc => ({
                    id: doc.data().id,
                    data: doc.data().data,
                    vendedorId: doc.data().vendedorId,
                    cashback: doc.data().cashback,
                    avaliacoes: doc.data().avaliacoes,
                    tarefas: doc.data().tarefas || [],
                    timestamp: doc.data().timestamp,
                    criadoEm: doc.data().criadoEm
                }));

                // Carregar tarefas
                const tarefasSnapshot = await db.collection('tarefas').get();
                tarefas = tarefasSnapshot.docs.map(doc => ({
                    id: doc.data().id,
                    vendedorId: doc.data().vendedorId,
                    data: doc.data().data,
                    descricao: doc.data().descricao,
                    status: doc.data().status,
                    timestamp: doc.data().timestamp,
                    criadoEm: doc.data().criadoEm
                }));

                // Carregar afazeres cadastrados
                const afazeresSnapshot = await db.collection('afazeresCadastrados').get();
                afazeresCadastrados = afazeresSnapshot.docs.map(doc => ({
                    id: doc.data().id,
                    descricao: doc.data().descricao,
                    recorrencia: doc.data().recorrencia,
                    diasSemana: doc.data().diasSemana || []
                }));

                // Carregar observações do relatório
                const observacoesSnapshot = await db.collection('observacoes').get();
                observacoes = observacoesSnapshot.docs.map(doc => ({
                    id: doc.data().id,
                    data: doc.data().data,
                    texto: doc.data().texto,
                    timestamp: doc.data().timestamp
                }));

                // Carregar funcionarioStatus
                const funcionarioStatusSnapshot = await db.collection('funcionarioStatus').get();
                funcionarioStatus = funcionarioStatusSnapshot.docs.map(doc => ({
                    id: doc.data().id,
                    data: doc.data().data,
                    vendedorId: doc.data().vendedorId,
                    status: doc.data().status,
                    timestamp: doc.data().timestamp
                }));

                dadosCarregados = true;
                
                // Executar limpeza automática ao carregar
                await limparDadosAntigos();
                
            } catch (error) {
                console.error('Erro ao carregar dados do Firestore:', error);
                showToast('⚠️ Erro ao carregar dados. Verifique sua conexão.', 'error');
            }
        }

        // Salvar configurações
        async function salvarConfiguracoes() {
            try {
                await db.collection('configuracoes').doc('sistema').set({
                    lojaNome: lojaNome,
                    metaCashback: metaCashback,
                    metaAvaliacoes: metaAvaliacoes,
                    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                console.error('Erro ao salvar configurações:', error);
                showToast('⚠️ Erro ao salvar configurações.', 'error');
            }
        }

        // Salvar vendedores
        async function salvarVendedores() {
            try {
                const batch = db.batch();
                
                // Deletar todos os vendedores existentes
                const snapshot = await db.collection('vendedores').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // Adicionar novos vendedores
                vendedores.forEach(v => {
                    const ref = db.collection('vendedores').doc();
                    batch.set(ref, {
                        id: v.id,
                        nome: v.nome,
                        cor: v.cor,
                        icone: v.icone,
                        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar vendedores:', error);
                showToast('⚠️ Erro ao salvar vendedores.', 'error');
            }
        }

        // Salvar registros
        async function salvarRegistros() {
            try {
                const batch = db.batch();
                
                // Deletar todos os registros existentes
                const snapshot = await db.collection('registros').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // Adicionar novos registros
                registros.forEach(r => {
                    const ref = db.collection('registros').doc();
                    batch.set(ref, {
                        id: r.id,
                        data: r.data,
                        vendedorId: r.vendedorId,
                        cashback: r.cashback,
                        avaliacoes: r.avaliacoes,
                        tarefas: r.tarefas || [],
                        timestamp: r.timestamp,
                        criadoEm: r.criadoEm || firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar registros:', error);
                showToast('⚠️ Erro ao salvar registros.', 'error');
            }
        }

        // Salvar tarefas
        async function salvarTarefas() {
            try {
                const batch = db.batch();
                
                // Deletar todas as tarefas existentes
                const snapshot = await db.collection('tarefas').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // Adicionar novas tarefas
                tarefas.forEach(t => {
                    const ref = db.collection('tarefas').doc();
                    batch.set(ref, {
                        id: t.id,
                        vendedorId: t.vendedorId,
                        data: t.data,
                        descricao: t.descricao,
                        status: t.status,
                        timestamp: t.timestamp,
                        criadoEm: t.criadoEm || firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar tarefas:', error);
                showToast('⚠️ Erro ao salvar tarefas.', 'error');
            }
        }

        // Salvar afazeres cadastrados
        async function salvarAfazeresCadastrados() {
            try {
                const batch = db.batch();
                
                // Deletar todos os afazeres existentes
                const snapshot = await db.collection('afazeresCadastrados').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // Adicionar novos afazeres
                afazeresCadastrados.forEach(a => {
                    const ref = db.collection('afazeresCadastrados').doc();
                    batch.set(ref, {
                        id: a.id,
                        descricao: a.descricao,
                        recorrencia: a.recorrencia,
                        diasSemana: a.diasSemana || [],
                        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar afazeres:', error);
                showToast('⚠️ Erro ao salvar afazeres.', 'error');
            }
        }

        // Salvar observações do relatório
        async function salvarObservacoes() {
            try {
                const batch = db.batch();

                // Deletar todas as observações existentes
                const snapshot = await db.collection('observacoes').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                // Adicionar novas observações
                observacoes.forEach(o => {
                    const ref = db.collection('observacoes').doc();
                    batch.set(ref, {
                        id: o.id,
                        data: o.data,
                        texto: o.texto,
                        timestamp: o.timestamp,
                        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar observações:', error);
                showToast('⚠️ Erro ao salvar observações.', 'error');
            }
        }

        // Salvar funcionarioStatus
        async function salvarFuncionarioStatus() {
            try {
                const batch = db.batch();

                const snapshot = await db.collection('funcionarioStatus').get();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                funcionarioStatus.forEach(fs => {
                    const ref = db.collection('funcionarioStatus').doc();
                    batch.set(ref, {
                        id: fs.id,
                        data: fs.data,
                        vendedorId: fs.vendedorId,
                        status: fs.status,
                        timestamp: fs.timestamp || new Date().toISOString(),
                        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
            } catch (error) {
                console.error('Erro ao salvar funcionarioStatus:', error);
                showToast('⚠️ Erro ao salvar status do funcionário.', 'error');
            }
        }

        // Limpar dados antigos (mais de 180 dias)
        async function limparDadosAntigos() {
            try {
                const dataLimite = new Date();
                dataLimite.setDate(dataLimite.getDate() - DIAS_LIMPEZA_AUTOMATICA);
                
                // Limpar registros antigos
                const registrosSnapshot = await db.collection('registros')
                    .where('timestamp', '<', dataLimite.toISOString())
                    .get();
                
                if (!registrosSnapshot.empty) {
                    const batch = db.batch();
                    registrosSnapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    
                    // Atualizar array local
                    registros = registros.filter(r => {
                        const rDate = new Date(r.timestamp);
                        return rDate >= dataLimite;
                    });
                    
                    console.log(`Limpeza: ${registrosSnapshot.size} registros antigos removidos`);
                }
                
                // Limpar tarefas antigas
                const tarefasSnapshot = await db.collection('tarefas')
                    .where('timestamp', '<', dataLimite.toISOString())
                    .get();
                
                if (!tarefasSnapshot.empty) {
                    const batch = db.batch();
                    tarefasSnapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    
                    // Atualizar array local
                    tarefas = tarefas.filter(t => {
                        const tDate = new Date(t.timestamp);
                        return tDate >= dataLimite;
                    });
                    
                    console.log(`Limpeza: ${tarefasSnapshot.size} tarefas antigas removidas`);
                }
                
            } catch (error) {
                console.error('Erro ao limpar dados antigos:', error);
            }
        }

        // ============================
        // INICIALIZAÇÃO
        // ============================
        async function init() {
            try {
                await carregarDados();
                setupEventListeners();
                setDataHoje();
                document.getElementById('lojaNomeHeader').textContent = lojaNome;
                atualizarMetasHeader();
                renderVendedores();
                atualizarResumoHoje();
                atualizarSelectsVendedores();
                popularSelectVendedorGrafico();
                renderDiasSemanaChecks();
                renderDashboardEncarregado();
            } catch (error) {
                console.error('Erro na inicialização:', error);
                showToast('⚠️ Erro ao inicializar o sistema.', 'error');
            } finally {
                // Esconder loading overlay
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.classList.add('hidden');
                    setTimeout(() => overlay.remove(), 300);
                }
            }
        }

        function setupEventListeners() {
            // Config loja
            document.getElementById('abrirConfig').addEventListener('click', () => {
                document.getElementById('lojaNome').value = lojaNome;
                document.getElementById('metaCashback').value = metaCashback;
                document.getElementById('metaAvaliacoes').value = metaAvaliacoes;
                document.getElementById('configModal').classList.add('active');
            });
            document.getElementById('configForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                lojaNome = document.getElementById('lojaNome').value.trim() || 'Minha Loja';
                metaCashback = parseInt(document.getElementById('metaCashback').value) || 100;
                metaAvaliacoes = parseInt(document.getElementById('metaAvaliacoes').value) || 15;
                
                await salvarConfiguracoes();
                
                document.getElementById('lojaNomeHeader').textContent = lojaNome;
                
                closeConfigModal();
                showToast('⚙️ Configurações salvas com sucesso!', 'success');
                atualizarMetasHeader();
                renderDashboardEncarregado();
            });

            document.getElementById('registroForm').addEventListener('submit', salvarRegistro);
            
            // Botão Voltar para o Passo 1
            document.getElementById('btnVoltarPasso1').addEventListener('click', () => {
                document.getElementById('passo2').style.display = 'none';
                const passo1 = document.getElementById('passo1');
                passo1.style.display = 'block';
                passo1.classList.add('fade-in');
                
                // Limpar seleção
                document.querySelectorAll('.vendedor-card').forEach(c => c.classList.remove('selected'));
                document.getElementById('vendedorSelecionado').value = '';
                avulsasTemp = [];
                afazeresSelecionados.clear(); // Limpar seleções de afazeres
                const pesquisaAfazeres = document.getElementById('pesquisaAfazeres');
                if (pesquisaAfazeres) pesquisaAfazeres.value = '';
            });

            // Tarefa avulsa no form principal
            document.getElementById('btnAddAvulsa').addEventListener('click', adicionarAvulsa);
            document.getElementById('tarefaAvulsa').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); adicionarAvulsa(); }
            });

            // Pesquisa de afazeres
            document.getElementById('pesquisaAfazeres').addEventListener('input', () => {
                renderAfazeresCheckboxes();
            });

            // Drawer lateral de tabs (mobile)
            const adminTabsEl = document.getElementById('adminTabs');
            const tabsOverlayEl = document.getElementById('tabsOverlay');
            const tabsToggleEl = document.getElementById('tabsToggle');
            const tabsCloseEl = document.getElementById('tabsClose');
            const tabsToggleLabel = document.getElementById('tabsToggleLabel');
            function abrirTabsDrawer() {
                if (adminTabsEl) adminTabsEl.classList.add('open');
                if (tabsOverlayEl) tabsOverlayEl.classList.add('active');
            }
            function fecharTabsDrawer() {
                if (adminTabsEl) adminTabsEl.classList.remove('open');
                if (tabsOverlayEl) tabsOverlayEl.classList.remove('active');
            }
            function atualizarLabelTab() {
                const ativa = document.querySelector('.tab.active');
                if (ativa && tabsToggleLabel) {
                    tabsToggleLabel.textContent = ativa.textContent.trim();
                }
            }
            if (tabsToggleEl) tabsToggleEl.addEventListener('click', abrirTabsDrawer);
            if (tabsCloseEl) tabsCloseEl.addEventListener('click', fecharTabsDrawer);
            if (tabsOverlayEl) tabsOverlayEl.addEventListener('click', fecharTabsDrawer);
            atualizarLabelTab();

            // Tabs (lazy render)
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const target = tab.dataset.tab;
                    if ((target === 'gerenciar' && !gerenciarDesbloqueado) || (target === 'tarefas' && !tarefasDesbloqueado)) {
                        requestedTab = target;
                        document.getElementById('senhaAbaInput').value = '';
                        document.getElementById('senhaAbaModal').classList.add('active');
                        setTimeout(() => document.getElementById('senhaAbaInput').focus(), 50);
                        return; // Don't switch tab yet
                    }

                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(target).classList.add('active');
                    atualizarLabelTab();
                    fecharTabsDrawer();
                    if (target === 'dashboardEnc') renderDashboardEncarregado();
                    if (target === 'tarefas') {
                        // Auto-carregar para o dia atual (Fix #4)
                        const filtroData = document.getElementById('filtroTarefaData');
                        if (filtroData && !filtroData.value) {
                            filtroData.value = obterDataLocal();
                        }
                        renderTarefasLista();
                    }
                    else if (target === 'gerenciar') renderGerenciarLista();
                    else if (target === 'cadastroAfazeres') renderAfazeresCadastroLista();
                    else if (target === 'relatorios') gerarRelatorio(); // Atualiza relatório ao abrir a aba
                });
            });

            // Relatórios
            document.getElementById('gerarRelatorio').addEventListener('click', gerarRelatorio);
            // Ao mudar a data do relatório, carregar a observação salva do Firestore
            document.getElementById('dataRelatorio').addEventListener('change', () => {
                const dataRel = document.getElementById('dataRelatorio').value;
                const obsSalva = observacoes.find(o => o.data === dataRel);
                document.getElementById('observacaoRelatorio').value = obsSalva ? obsSalva.texto : '';
                renderFuncionarioStatusSection();
            });

            // Gráficos
            document.getElementById('gerarGraficos').addEventListener('click', gerarGraficos);
            document.getElementById('gerarGraficoTarefas').addEventListener('click', gerarGraficoTarefas);

            document.getElementById('editarRegistroForm').addEventListener('submit', salvarEdicaoRegistro);

            // Filtro de vendedor em gerenciar
            document.getElementById('filtroVendedor').addEventListener('change', renderGerenciarLista);

            // Tarefas
            document.getElementById('adicionarTarefa').addEventListener('click', () => {
                document.getElementById('tarefaModalTitle').textContent = '➕ Adicionar Tarefa';
                document.getElementById('tarefaId').value = '';
                document.getElementById('tarefaDescricao').value = '';
                document.getElementById('tarefaStatus').value = 'pendente';
                document.getElementById('tarefaData').value = obterDataLocal();
                preencherSelectTarefaVendedor();
                preencherSelectTarefaDescricao();
                document.getElementById('tarefaModal').classList.add('active');
            });
            document.getElementById('tarefaForm').addEventListener('submit', salvarTarefa);
            document.getElementById('filtroTarefaVendedor').addEventListener('change', renderTarefasLista);
            document.getElementById('filtroTarefaData').addEventListener('change', renderTarefasLista);

            // Dashboard Encarregado
            document.getElementById('atualizarDashboard').addEventListener('click', renderDashboardEncarregado);

            // Cadastro de Afazeres (templates)
            document.getElementById('adicionarAfazerCadastro').addEventListener('click', () => abrirAfazerCadastroModal());
            document.getElementById('afazerCadastroForm').addEventListener('submit', salvarAfazerCadastro);
            document.getElementById('afazerCadastroRecorrencia').addEventListener('change', (e) => {
                document.getElementById('afazerDiasSemanaGroup').style.display =
                    e.target.value === 'semanal' ? 'block' : 'none';
            });
        }

        // Função para obter a data no fuso horário de São Paulo/Brasília (UTC-3)
        function obterDataLocal() {
            const agora = new Date();
            // Formata a data no fuso de São Paulo usando Intl.DateTimeFormat
            const formatador = new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const partes = formatador.formatToParts(agora);
            const ano = partes.find(p => p.type === 'year').value;
            const mes = partes.find(p => p.type === 'month').value;
            const dia = partes.find(p => p.type === 'day').value;
            return `${ano}-${mes}-${dia}`;
        }

        function setDataHoje() {
            const hoje = obterDataLocal();
            document.getElementById('dataRegistro').value = hoje;
            document.getElementById('dashboardData').value = hoje;
            document.getElementById('dataRelatorio').value = hoje; // Fix #5: auto-set report date
            document.getElementById('filtroTarefaData').value = hoje; // Fix #4: auto-set tasks filter

            // Set current month for charts
            const mesAtual = hoje.slice(0, 7);
            document.getElementById('mesGrafico').value = mesAtual;

            document.getElementById('dataRegistro').addEventListener('change', () => {
                if (document.getElementById('vendedorSelecionado').value) {
                    renderAfazeresCheckboxes();
                }
            });
        }

        function atualizarModoUsuario() { /* removido — sem mais modo admin */ }

        function renderVendedores() {
            const grid = document.getElementById('vendedoresGrid');
            grid.innerHTML = '';

            vendedores.forEach(vendedor => {
                const card = document.createElement('div');
                card.className = 'vendedor-card';
                card.style.color = vendedor.cor;
                card.innerHTML = `
                    <button type="button" class="vendedor-edit-btn" title="Editar nome" style="top: 6px; right: 32px;">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="vendedor-edit-btn" title="Excluir funcionário" style="top: 6px; right: 6px; color: var(--danger);" onclick="event.stopPropagation(); excluirVendedor(${vendedor.id});">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="vendedor-icon">
                        <i class="fas ${vendedor.icone}"></i>
                    </div>
                    <div class="vendedor-name">${vendedor.nome}</div>
                `;
                card.addEventListener('click', () => selecionarVendedor(vendedor.id, card));
                card.querySelector('.vendedor-edit-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    abrirEditarVendedorModal(vendedor.id);
                });
                grid.appendChild(card);
            });
        }

        function selecionarVendedor(id, card) {
            document.querySelectorAll('.vendedor-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            document.getElementById('vendedorSelecionado').value = id;
            
            // Transição suave para o Passo 2
            const passo1 = document.getElementById('passo1');
            const passo2 = document.getElementById('passo2');
            
            passo1.style.display = 'none';
            passo2.style.display = 'block';
            passo2.classList.add('fade-in');
            
            // Resetar seleções de afazeres para o novo funcionário (Fix #2)
            avulsasTemp = [];
            afazeresSelecionados.clear();
            const pesquisaAfazeres = document.getElementById('pesquisaAfazeres');
            if (pesquisaAfazeres) pesquisaAfazeres.value = '';
            renderAvulsasList();
            renderAfazeresCheckboxes();
        }

        // ===== Edição de funcionário =====
        function abrirEditarVendedorModal(id) {
            const v = vendedores.find(x => x.id === id);
            if (!v) return;
            document.getElementById('editarVendedorId').value = v.id;
            document.getElementById('editarVendedorNome').value = v.nome;
            document.getElementById('editarVendedorCor').value = v.cor || '#3498db';
            document.getElementById('editarVendedorModal').classList.add('active');
            setTimeout(() => document.getElementById('editarVendedorNome').focus(), 50);
        }
        function closeEditarVendedorModal() {
            document.getElementById('editarVendedorModal').classList.remove('active');
        }
        async function salvarEdicaoVendedor(e) {
            e.preventDefault();
            const id = parseInt(document.getElementById('editarVendedorId').value);
            const nome = document.getElementById('editarVendedorNome').value.trim();
            const cor = document.getElementById('editarVendedorCor').value;
            if (!nome) {
                if (typeof showToast === 'function') showToast('⚠️ Nome obrigatório', 'warning');
                return;
            }
            const v = vendedores.find(x => x.id === id);
            if (!v) return;
            v.nome = nome;
            v.cor = cor;
            await salvarVendedores();
            renderVendedores();
            atualizarSelectsVendedores();
            if (typeof renderRelatorio === 'function') {
                try { renderRelatorio(); } catch (_) {}
            }
            closeEditarVendedorModal();
            if (typeof showToast === 'function') showToast('✅ Funcionário atualizado!', 'success');
        }
        document.addEventListener('DOMContentLoaded', () => {
            const f = document.getElementById('editarVendedorForm');
            if (f) f.addEventListener('submit', salvarEdicaoVendedor);
            const modal = document.getElementById('editarVendedorModal');
            if (modal) modal.addEventListener('click', e => {
                if (e.target === modal) closeEditarVendedorModal();
            });

            // Adicionar vendedor form
            const fAdd = document.getElementById('adicionarVendedorForm');
            if (fAdd) fAdd.addEventListener('submit', salvarNovoVendedor);
            const modalAdd = document.getElementById('adicionarVendedorModal');
            if (modalAdd) modalAdd.addEventListener('click', e => {
                if (e.target === modalAdd) closeAdicionarVendedorModal();
            });
        });

        // ===== Adicionar novo funcionário =====
        function abrirAdicionarVendedorModal() {
            document.getElementById('novoVendedorNome').value = '';
            document.getElementById('novoVendedorCor').value = '#6366f1';
            document.getElementById('novoVendedorIcone').value = 'fa-user';
            document.getElementById('adicionarVendedorModal').classList.add('active');
            setTimeout(() => document.getElementById('novoVendedorNome').focus(), 50);
        }
        function closeAdicionarVendedorModal() {
            document.getElementById('adicionarVendedorModal').classList.remove('active');
        }
        async function salvarNovoVendedor(e) {
            e.preventDefault();
            const nome = document.getElementById('novoVendedorNome').value.trim();
            const cor = document.getElementById('novoVendedorCor').value;
            const icone = document.getElementById('novoVendedorIcone').value;
            if (!nome) {
                showToast('⚠️ Nome obrigatório', 'warning');
                return;
            }
            // Verificar nome duplicado
            if (vendedores.some(v => v.nome.toLowerCase() === nome.toLowerCase())) {
                showToast('⚠️ Já existe um funcionário com este nome!', 'warning');
                return;
            }
            // Gerar ID único baseado no maior ID já existente (Fix #3)
            const novoId = Math.max(0, ...vendedores.map(v => v.id), ...registros.map(r => r.vendedorId || 0), ...tarefas.map(t => t.vendedorId || 0)) + 1;
            vendedores.push({ id: novoId, nome, cor, icone });
            await salvarVendedores();
            renderVendedores();
            atualizarSelectsVendedores();
            closeAdicionarVendedorModal();
            showToast('✅ Funcionário adicionado com sucesso!', 'success');
        }

        // ===== Excluir funcionário =====
        async function excluirVendedor(id) {
            const v = vendedores.find(x => x.id === id);
            if (!v) return;
            customConfirm(`Tem certeza que deseja excluir o funcionário "${v.nome}"? Todos os registros e tarefas associados serão removidos.`, '🗑️ Excluir funcionário').then(async (ok) => {
                if (!ok) return;
                vendedores = vendedores.filter(x => x.id !== id);
                // Limpar registros e tarefas associados ao funcionário excluído (Fix #3)
                registros = registros.filter(r => r.vendedorId !== id);
                tarefas = tarefas.filter(t => t.vendedorId !== id);
                await salvarVendedores();
                await salvarRegistros();
                await salvarTarefas();
                renderVendedores();
                atualizarSelectsVendedores();
                atualizarResumoHoje();
                atualizarMetasHeader();
                showToast('Funcionário excluído!', 'success');
            });
        }

        // Renderiza os checkboxes do passo 2 baseados nos afazeres cadastrados
        // e na data + dia da semana (filtrando recorrência)
        function renderAfazeresCheckboxes() {
            const container = document.getElementById('afazeresCheckboxes');
            const pesquisaInput = document.getElementById('pesquisaAfazeres');
            const termoPesquisa = pesquisaInput ? pesquisaInput.value.toLowerCase().trim() : '';
            const data = document.getElementById('dataRegistro').value;
            const diaSemana = data ? new Date(data + 'T00:00:00').getDay() : null;

            // Usar o Set global afazeresSelecionados para preservar seleções (Fix #1)
            const relevantes = afazeresCadastrados.filter(a => {
                if (a.recorrencia === 'diaria') return true;
                if (a.recorrencia === 'avulsa') return true;
                if (a.recorrencia === 'semanal') return a.diasSemana && a.diasSemana.includes(diaSemana);
                return false;
            });

            // Filtrar por pesquisa
            const filtrados = termoPesquisa 
                ? relevantes.filter(a => a.descricao.toLowerCase().includes(termoPesquisa))
                : relevantes;

            const totalLabel = document.getElementById('afazeresTotalLabel');
            if (totalLabel) {
                totalLabel.textContent = termoPesquisa 
                    ? `${filtrados.length} de ${relevantes.length} encontrados`
                    : `${relevantes.length} disponíveis`;
            }

            if (filtrados.length === 0) {
                container.innerHTML = termoPesquisa
                    ? '<div class="afazeres-empty"><i class="fas fa-search"></i>Nenhum afazer encontrado para esta pesquisa.</div>'
                    : '<div class="afazeres-empty"><i class="fas fa-inbox"></i>Nenhum afazer cadastrado.<br>Cadastre na aba "Cadastrar Afazeres".</div>';
                atualizarContadorAfazeres();
                return;
            }

            container.innerHTML = filtrados.map(a => {
                const desc = String(a.descricao).replace(/"/g,'&quot;');
                const badge = a.recorrencia;
                const label = badge.charAt(0).toUpperCase() + badge.slice(1);
                const checked = afazeresSelecionados.has(a.descricao) ? 'checked' : '';
                return `
                    <label class="afazer-item ${checked ? 'checked' : ''}">
                        <input type="checkbox" class="afazerCheck" value="${desc}" ${checked}>
                        <span class="afazer-text">${a.descricao}</span>
                        <span class="afazer-badge ${badge}">${label}</span>
                    </label>
                `;
            }).join('');

            container.querySelectorAll('.afazerCheck').forEach(chk => {
                chk.addEventListener('change', e => {
                    const desc = e.target.value;
                    if (e.target.checked) {
                        afazeresSelecionados.add(desc);
                    } else {
                        afazeresSelecionados.delete(desc);
                    }
                    e.target.closest('.afazer-item').classList.toggle('checked', e.target.checked);
                    atualizarContadorAfazeres();
                });
            });
            atualizarContadorAfazeres();
        }

        function atualizarContadorAfazeres() {
            const el = document.getElementById('afazeresSelCount');
            if (el) el.textContent = afazeresSelecionados.size;
        }

        function adicionarAvulsa() {
            const input = document.getElementById('tarefaAvulsa');
            const v = input.value.trim();
            if (!v) return;
            avulsasTemp.push(v);
            input.value = '';
            renderAvulsasList();
        }

        function renderAvulsasList() {
            const c = document.getElementById('avulsasList');
            if (avulsasTemp.length === 0) { c.innerHTML = ''; return; }
            c.innerHTML = avulsasTemp.map((t, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #eef0f4; padding:8px 12px; border-radius:6px;">
                    <span>➕ ${t}</span>
                    <button type="button" class="btn btn-danger btn-small" onclick="removerAvulsa(${i})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }

        function removerAvulsa(i) {
            avulsasTemp.splice(i, 1);
            renderAvulsasList();
        }

        function isTaskLocked(task) {
            if (!task.timestamp) return false;
            const ageMs = Date.now() - new Date(task.timestamp).getTime();
            return ageMs > 72 * 60 * 60 * 1000; // 72 horas em milissegundos
        }

        async function salvarRegistro(e) {
            e.preventDefault();

            const data = document.getElementById('dataRegistro').value;
            const vendedorId = parseInt(document.getElementById('vendedorSelecionado').value);
            const cashback = parseInt(document.getElementById('cashback').value) || 0;
            const avaliacoes = parseInt(document.getElementById('avaliacoes').value) || 0;

            if (!vendedorId) {
                showToast('⚠️ Por favor, selecione um funcionário!', 'warning');
                return;
            }

            const checadas = Array.from(afazeresSelecionados);
            const tarefasFeitas = [...checadas, ...avulsasTemp];

            // Adicionar tarefas ao array de tarefas com status pendente
            const now = Date.now();
            tarefasFeitas.forEach((desc, i) => {
                tarefas.push({
                    id: now + i,
                    vendedorId,
                    data,
                    descricao: desc,
                    status: 'pendente',
                    timestamp: new Date().toISOString(),
                    criadoEm: new Date()
                });
            });
            await salvarTarefas();

            const registro = {
                id: Date.now() + 9999,
                data,
                vendedorId,
                cashback,
                avaliacoes,
                tarefas: tarefasFeitas,
                timestamp: new Date().toISOString(),
                criadoEm: new Date()
            };

            registros.push(registro);
            await salvarRegistros();

            // Executar limpeza automática após salvar
            await limparDadosAntigos();

            // Mostrar tela de sucesso
            document.getElementById('passo2').style.display = 'none';
            const telaSucesso = document.getElementById('telaSucesso');
            telaSucesso.style.display = 'block';
            telaSucesso.classList.add('fade-in');

            atualizarResumoHoje();
            atualizarMetasHeader();
            // Re-renders pesados acontecem só quando a aba estiver ativa
            if (document.getElementById('gerenciar').classList.contains('active')) renderGerenciarLista();
            if (document.getElementById('dashboardEnc').classList.contains('active')) renderDashboardEncarregado();

            // Retornar ao Passo 1 após 2.5 segundos
            setTimeout(() => {
                telaSucesso.style.display = 'none';
                const passo1 = document.getElementById('passo1');
                passo1.style.display = 'block';
                passo1.classList.add('fade-in');
                
                // Limpar formulário completamente
                document.getElementById('cashback').value = '0';
                document.getElementById('avaliacoes').value = '0';
                document.querySelectorAll('.vendedor-card').forEach(c => c.classList.remove('selected'));
                document.getElementById('vendedorSelecionado').value = '';
                avulsasTemp = [];
                afazeresSelecionados.clear(); // Limpar seleções de afazeres
                const pesquisaAfazeres = document.getElementById('pesquisaAfazeres');
                if (pesquisaAfazeres) pesquisaAfazeres.value = '';
            }, 2500);
        }

        function atualizarMetasHeader() {
            const hoje = obterDataLocal();
            const mesAtual = hoje.slice(0, 7);
            const registrosMes = registros.filter(r => r.data.startsWith(mesAtual));
            
            const totalCashMes = registrosMes.reduce((sum, r) => sum + r.cashback, 0);
            const totalAvalMes = registrosMes.reduce((sum, r) => sum + r.avaliacoes, 0);
            
            const pctCashMes = metaCashback > 0 ? ((totalCashMes / metaCashback) * 100).toFixed(1) : 0;
            const pctAvalMes = metaAvaliacoes > 0 ? ((totalAvalMes / metaAvaliacoes) * 100).toFixed(1) : 0;
            
            document.getElementById('metaCashbackHeader').textContent = metaCashback;
            document.getElementById('metaCashbackPctHeader').textContent = `(${totalCashMes} - ${pctCashMes}%)`;
            
            document.getElementById('metaAvaliacoesHeader').textContent = metaAvaliacoes;
            document.getElementById('metaAvaliacoesPctHeader').textContent = `(${totalAvalMes} - ${pctAvalMes}%)`;
        }

        function atualizarResumoHoje() {
            const hoje = obterDataLocal();
            const registrosHoje = registros.filter(r => r.data === hoje);
            
            const container = document.getElementById('resumoHoje');
            
            if (registrosHoje.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-calendar-times"></i>
                        <p>Nenhum registro hoje</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="stats-grid">';
            
            vendedores.forEach(vendedor => {
                const regsVendedor = registrosHoje.filter(r => r.vendedorId === vendedor.id);
                if (regsVendedor.length > 0) {
                    const totalCashback = regsVendedor.reduce((sum, r) => sum + r.cashback, 0);
                    const totalAvaliacoes = regsVendedor.reduce((sum, r) => sum + r.avaliacoes, 0);
                    
                    html += `
                        <div class="stat-card" style="border-top: 3px solid ${vendedor.cor};">
                            <i class="fas ${vendedor.icone}" style="color: ${vendedor.cor};"></i>
                            <div class="label">${vendedor.nome}</div>
                            <div class="value" style="color: ${vendedor.cor};">${totalCashback}</div>
                            <div class="label">Cashback</div>
                            <div class="value" style="color: ${vendedor.cor}; font-size: 1.5rem;">${totalAvaliacoes}</div>
                            <div class="label">Avaliações</div>
                        </div>
                    `;
                }
            });
            
            html += '</div>';
            container.innerHTML = html;
        }

        function atualizarSelectsVendedores() {
            const selects = ['vendedorRelatorio', 'filtroVendedor', 'filtroTarefaVendedor'];
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                const valorAtual = select.value;
                
                // Manter primeira opção
                const primeiraOpcao = select.options[0];
                select.innerHTML = '';
                select.appendChild(primeiraOpcao);
                
                vendedores.forEach(v => {
                    const option = document.createElement('option');
                    option.value = v.id;
                    option.textContent = v.nome;
                    select.appendChild(option);
                });
                
                if (valorAtual) {
                    select.value = valorAtual;
                }
            });
            // Atualizar também o select do gráfico de tarefas
            popularSelectVendedorGrafico();
        }

        function popularSelectVendedorGrafico() {
            const select = document.getElementById('vendedorGraficoTarefas');
            if (!select) return;
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione um funcionário...</option>';
            vendedores.forEach(v => {
                const option = document.createElement('option');
                option.value = v.id;
                option.textContent = v.nome;
                select.appendChild(option);
            });
            if (valorAtual) {
                select.value = valorAtual;
            }
        }

        function renderFuncionarioStatusSection() {
            const dataRel = document.getElementById('dataRelatorio').value || obterDataLocal();
            const container = document.getElementById('funcionarioStatusLista');
            if (!container) return;

            if (vendedores.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">Nenhum funcionário cadastrado.</p>';
                return;
            }

            container.innerHTML = vendedores.map(v => {
                const statusEntry = funcionarioStatus.find(fs => fs.data === dataRel && fs.vendedorId === v.id);
                const statusVal = statusEntry ? statusEntry.status : 'normal';
                return `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-elev); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); border-left: 4px solid ${v.cor};">
                        <i class="fas ${v.icone}" style="color: ${v.cor}; font-size: 1.1rem; flex-shrink: 0;"></i>
                        <span style="font-weight: 600; font-size: 0.88rem; min-width: 80px; color: var(--text);">${v.nome}</span>
                        <div style="display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.82rem; color: var(--text-muted);">
                                <input type="radio" name="status_${v.id}" value="normal" ${statusVal === 'normal' ? 'checked' : ''} onchange="setFuncionarioStatus(${v.id}, 'normal')"> Normal
                            </label>
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.82rem; color: var(--warning);">
                                <input type="radio" name="status_${v.id}" value="falta" ${statusVal === 'falta' ? 'checked' : ''} onchange="setFuncionarioStatus(${v.id}, 'falta')"> ❌ Falta
                            </label>
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.82rem; color: var(--primary);">
                                <input type="radio" name="status_${v.id}" value="atestado" ${statusVal === 'atestado' ? 'checked' : ''} onchange="setFuncionarioStatus(${v.id}, 'atestado')"> 🩺 Atestado
                            </label>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function setFuncionarioStatus(vendedorId, status) {
            const dataRel = document.getElementById('dataRelatorio').value || obterDataLocal();
            // Remove any existing status for this date/employee
            funcionarioStatus = funcionarioStatus.filter(fs => !(fs.data === dataRel && fs.vendedorId === vendedorId));
            // Add new status only if not normal
            if (status !== 'normal') {
                funcionarioStatus.push({
                    id: Date.now(),
                    data: dataRel,
                    vendedorId: vendedorId,
                    status: status,
                    timestamp: new Date().toISOString()
                });
            }
            await salvarFuncionarioStatus();
            gerarRelatorio();
        }

        function gerarRelatorio() {
            const vendedorId = document.getElementById('vendedorRelatorio').value;
            let dataRelatorio = document.getElementById('dataRelatorio').value;

            // Carregar automático do dia se não estiver preenchido
            if (!dataRelatorio) {
                dataRelatorio = obterDataLocal();
                document.getElementById('dataRelatorio').value = dataRelatorio;
            }

            // Atualizar a seção de status do funcionário
            renderFuncionarioStatusSection();

            let registrosFiltrados = [...registros];

            if (vendedorId) {
                registrosFiltrados = registrosFiltrados.filter(r => r.vendedorId == vendedorId);
            }
            registrosFiltrados = registrosFiltrados.filter(r => r.data === dataRelatorio);

            const container = document.getElementById('relatorioResultado');

            const dataF = new Date(dataRelatorio + 'T00:00:00').toLocaleDateString('pt-BR');

            // Agrupa por funcionário
            const porFuncionario = {};
            registrosFiltrados.forEach(r => {
                if (!porFuncionario[r.vendedorId]) {
                    porFuncionario[r.vendedorId] = { cashback: 0, avaliacoes: 0, tarefas: [] };
                }
                porFuncionario[r.vendedorId].cashback += r.cashback;
                porFuncionario[r.vendedorId].avaliacoes += r.avaliacoes;
                if (Array.isArray(r.tarefas)) {
                    porFuncionario[r.vendedorId].tarefas.push(...r.tarefas);
                }
            });

            // Determinar quais funcionários exibir
            const vendedoresParaExibir = vendedorId
                ? vendedores.filter(v => v.id == vendedorId)
                : vendedores;

            let html = '';
            let textoCopia = '';

            // Cabeçalho do relatório
            const tituloRel = `📋 Relatório ${lojaNome} — ${dataF}`;
            textoCopia += `${tituloRel}\n`;
            textoCopia += `${'─'.repeat(11)}\n`;

            html += `
                <div class="dashboard-card" style="background: #eef2ff; border-color: #c7d2fe;">
                    <h3 style="color:#1f2937; margin-bottom:14px; font-size:1.25rem; font-weight:600;">${tituloRel}</h3>
            `;

            // Status de tarefas — legenda (um por linha)
            html += `
                <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 0.88rem; color: var(--text-muted);">
                    <span>✅ Concluído.</span>
                    <span>🔄 Em Andamento.</span>
                    <span>❌ Não Realizado.</span>
                </div>
                <div style="border-bottom: 1px solid #c7d2fe; margin-bottom: 16px;"></div>
            `;

            textoCopia += `✅ Concluído.\n`;
            textoCopia += `🔄 Em Andamento.\n`;
            textoCopia += `❌ Não Realizado.\n`;
            textoCopia += `${'─'.repeat(11)}\n`;

            vendedoresParaExibir.forEach(v => {
                const fsEntry = funcionarioStatus.find(fs => fs.data === dataRelatorio && fs.vendedorId === v.id);
                const statusVal = fsEntry ? fsEntry.status : null;

                html += `
                    <div style="margin: 10px 0; padding: 12px; background: #ffffff; border: 1px solid #eef0f4; border-radius: 8px; border-left: 4px solid ${v.cor};">
                        <h4 style="color:${v.cor}; margin-bottom:8px; font-size:1rem;">
                            👤 <em>${v.nome}</em>
                        </h4>
                `;
                textoCopia += `\n👤 *${v.nome}*\n`;

                if (statusVal === 'falta') {
                    html += `<p style="color: #ef4444; font-weight: 600; margin: 0;">❌ Faltou.</p>`;
                    textoCopia += `❌ Faltou.\n`;
                } else if (statusVal === 'atestado') {
                    html += `<p style="color: #4f46e5; font-weight: 600; margin: 0;">🩺 Atestado.</p>`;
                    textoCopia += `🩺 Atestado.\n`;
                } else if (!porFuncionario[v.id]) {
                    html += `<p style="color: #9ca3af; font-style: italic; margin: 0;">⚠️ Funcionário não registrou suas tarefas.</p>`;
                    textoCopia += `⚠️ Funcionário não registrou suas tarefas.\n`;
                } else {
                    const dadosV = porFuncionario[v.id];

                    // Combinar tarefas do registro e da aba tarefas
                    const tarefasDoRegistro = dadosV.tarefas || [];
                    const tarefasDaAba = tarefas
                        .filter(t => t.data === dataRelatorio && t.vendedorId == v.id)
                        .map(t => t.descricao);
                    const todasTarefas = [...new Set([...tarefasDoRegistro, ...tarefasDaAba])];

                    if (todasTarefas.length === 0) {
                        html += `<p style="color: #9ca3af; font-style: italic; margin: 0;">⚠️ Funcionário não registrou suas tarefas.</p>`;
                        textoCopia += `⚠️ Funcionário não registrou suas tarefas.\n`;
                    } else {
                        // Formato: "✅ Afazeres:" como cabeçalho, depois bullet points por tarefa
                        const listaTarefas = todasTarefas.map(tDesc => {
                            const tObj = tarefas.find(t => t.data === dataRelatorio && t.vendedorId == v.id && t.descricao === tDesc);
                            let icon = '⏳';
                            if (tObj) {
                                if (tObj.status === 'concluido') icon = '✅';
                                else if (tObj.status === 'em_andamento') icon = '🔄';
                                else if (tObj.status === 'nao_realizado') icon = '❌';
                            }
                            return { icon, desc: tDesc };
                        });

                        // HTML: cabeçalho "✅ Afazeres:" + lista com bullets
                        html += `<div style="margin-left:8px; margin-bottom: 4px; font-weight:600; font-size:0.9rem; color:#1f2937;">✅ Afazeres:</div>`;
                        html += `<div style="margin-left:16px; margin-bottom: 8px;">`;
                        html += listaTarefas.map(t => `<div style="font-size: 0.9rem;">${t.icon} ${t.desc}.</div>`).join('');
                        html += `</div>`;

                        // Texto copiado: "✅ Afazeres:" + bullets sem ícones individuais
                        textoCopia += `✅ Afazeres:\n`;
                        listaTarefas.forEach(t => { textoCopia += `  • ${t.desc}.\n`; });
                    }

                    html += `
                        <div style="margin-top:8px; display: flex; gap: 10px; flex-wrap: wrap;">
                            <span style="font-size: 0.88rem;">🎁 Cashback: <strong>${dadosV.cashback}</strong></span>
                            <span style="font-size: 0.88rem;">⭐ Avaliação: <strong>${dadosV.avaliacoes}</strong></span>
                        </div>
                    `;
                    textoCopia += `🎁 Cashback: ${dadosV.cashback}\n`;
                    textoCopia += `⭐ Avaliação: ${dadosV.avaliacoes}\n`;
                }

                html += `</div>`;
                textoCopia += `${'─'.repeat(11)}\n`;
            });

            html += `</div>`;

            // Adicionar observação ao final do relatório
            const obsDoFirestore = observacoes.find(o => o.data === dataRelatorio);
            const obs = obsDoFirestore ? obsDoFirestore.texto : document.getElementById('observacaoRelatorio').value.trim();
            if (obsDoFirestore && document.getElementById('observacaoRelatorio').value.trim() !== obsDoFirestore.texto) {
                document.getElementById('observacaoRelatorio').value = obsDoFirestore.texto;
            }
            if (obs) {
                html += `
                    <div class="dashboard-card" style="background: #fffbeb; border-color: #fde68a; margin-top: 16px;">
                        <h4 style="color: #92400e;"><i class="fas fa-comment-dots"></i> Obg do dia</h4>
                        <p style="color: #78350f; white-space: pre-wrap; margin: 0;">${obs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                    </div>
                `;
                textoCopia += `\n*Obg do dia*: ${obs}\n`;
            }
            textoCopia += `${'─'.repeat(11)}\n`;

            // Botão copiar
            html = `
                <div style="display:flex; justify-content:flex-end; margin-bottom:15px;">
                    <button class="btn btn-secondary" onclick="copiarRelatorio()">📋 Copiar relatório (texto)</button>
                </div>
                <textarea id="relatorioTextoCopia" style="position:absolute; left:-9999px;">${textoCopia.trim()}</textarea>
            ` + html;

            container.innerHTML = html;
        }

        function copiarRelatorio() {
            const ta = document.getElementById('relatorioTextoCopia');
            ta.style.position = 'static';
            ta.select();
            try {
                document.execCommand('copy');
                showToast('📋 Relatório copiado para a área de transferência!', 'success');
            } catch (err) {
                showToast('Erro ao copiar.', 'error');
            }
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
        }

        let observacaoRelatorioGlobal = '';

        async function adicionarObservacaoRelatorio() {
            const obs = document.getElementById('observacaoRelatorio').value.trim();
            if (!obs) {
                showToast('⚠️ Digite uma observação antes de adicionar.', 'warning');
                return;
            }
            const dataRelatorio = document.getElementById('dataRelatorio').value || obterDataLocal();
            observacaoRelatorioGlobal = obs;

            // Salvar/Atualizar observação no Firestore para a data selecionada
            const obsExistente = observacoes.find(o => o.data === dataRelatorio);
            if (obsExistente) {
                obsExistente.texto = obs;
                obsExistente.timestamp = new Date().toISOString();
            } else {
                observacoes.push({
                    id: Date.now(),
                    data: dataRelatorio,
                    texto: obs,
                    timestamp: new Date().toISOString()
                });
            }
            await salvarObservacoes();

            gerarRelatorio();
            showToast('📝 Observação salva e adicionada ao relatório!', 'success');
        }

        function renderGerenciarLista() {
            const filtroVendedor = document.getElementById('filtroVendedor').value;
            const container = document.getElementById('gerenciarLista');
            
            let registrosFiltrados = [...registros];
            if (filtroVendedor) {
                registrosFiltrados = registrosFiltrados.filter(r => r.vendedorId == filtroVendedor);
            }
            
            if (registrosFiltrados.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-database"></i>
                        <p>Nenhum registro encontrado</p>
                    </div>
                `;
                return;
            }
            
            let html = `
                <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Vendedor</th>
                            <th>Cashback</th>
                            <th>Avaliações</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            registrosFiltrados.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(reg => {
                const vendedor = vendedores.find(v => v.id === reg.vendedorId);
                if (vendedor) {
                    const dataFormatada = new Date(reg.data + 'T00:00:00').toLocaleDateString('pt-BR');
                    html += `
                        <tr>
                            <td>${dataFormatada}</td>
                            <td style="color: ${vendedor.cor}; font-weight: 600;">
                                <i class="fas ${vendedor.icone}"></i> ${vendedor.nome}
                            </td>
                            <td>${reg.cashback}</td>
                            <td>${reg.avaliacoes}</td>
                            <td>
                                <div class="actions">
                                    <button class="btn btn-secondary btn-small" onclick="editarRegistro(${reg.id})">
                                        <i class="fas fa-edit"></i> Editar
                                    </button>
                                    <button class="btn btn-danger btn-small" onclick="excluirRegistro(${reg.id})">
                                        <i class="fas fa-trash"></i> Excluir
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });
            
            html += '</tbody></table></div>';
            container.innerHTML = html;
        }

        function editarRegistro(id) {
            const registro = registros.find(r => r.id === id);
            if (!registro) return;
            
            document.getElementById('editarRegistroId').value = registro.id;
            document.getElementById('editarData').value = registro.data;
            document.getElementById('editarCashback').value = registro.cashback;
            document.getElementById('editarAvaliacoes').value = registro.avaliacoes;
            document.getElementById('editarRegistroModal').classList.add('active');
        }

        async function salvarEdicaoRegistro(e) {
            e.preventDefault();
            
            const id = parseInt(document.getElementById('editarRegistroId').value);
            const registro = registros.find(r => r.id === id);
            
            if (registro) {
                registro.data = document.getElementById('editarData').value;
                registro.cashback = parseInt(document.getElementById('editarCashback').value);
                registro.avaliacoes = parseInt(document.getElementById('editarAvaliacoes').value);
                
                await salvarRegistros();
                closeEditarRegistroModal();
                renderGerenciarLista();
                atualizarResumoHoje();
                showToast('Registro atualizado com sucesso!', 'success');
            }
        }

        async function excluirRegistro(id) {
            customConfirm('Tem certeza que deseja excluir este registro?', '🗑️ Excluir registro').then(async (ok) => {
                if (!ok) return;
                registros = registros.filter(r => r.id !== id);
                await salvarRegistros();
                renderGerenciarLista();
                atualizarResumoHoje();
                showToast('Registro excluído!', 'success');
            });
        }

        // Funções de gerenciamento de vendedores foram removidas — funcionários são fixos.

        function gerarGraficos() {
            const mes = document.getElementById('mesGrafico').value;
            if (!mes) {
                showToast('Por favor, selecione um mês!', 'warning');
                return;
            }
            
            const [ano, mesNum] = mes.split('-');
            const registrosMes = registros.filter(r => {
                const [regAno, regMes] = r.data.split('-');
                return regAno === ano && regMes === mesNum;
            });
            
            if (registrosMes.length === 0) {
                document.getElementById('graficosContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-line"></i>
                        <p>Nenhum registro encontrado para este mês</p>
                    </div>
                `;
                return;
            }

            // Calcular totais por vendedor
            const totaisPorVendedor = {};
            vendedores.forEach(v => {
                totaisPorVendedor[v.id] = { cashback: 0, avaliacoes: 0, afazeres: 0 };
            });
            
            registrosMes.forEach(reg => {
                if (totaisPorVendedor[reg.vendedorId]) {
                    totaisPorVendedor[reg.vendedorId].cashback += reg.cashback;
                    totaisPorVendedor[reg.vendedorId].avaliacoes += reg.avaliacoes;
                }
            });

            // Contar afazeres (tarefas) por vendedor no mês
            const tarefasMes = tarefas.filter(t => {
                const [tAno, tMes] = t.data.split('-');
                return tAno === ano && tMes === mesNum;
            });
            
            tarefasMes.forEach(t => {
                if (totaisPorVendedor[t.vendedorId]) {
                    totaisPorVendedor[t.vendedorId].afazeres += 1;
                }
            });

            const container = document.getElementById('graficosContainer');
            container.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr; gap: 30px; margin-top: 20px;">
                    <div class="card">
                        <h3 style="margin-bottom: 14px; color: #1f2937; font-size: 0.95rem; font-weight: 600;">
                            <i class="fas fa-gift"></i> Cashback por Vendedor
                        </h3>
                        <div class="chart-container" style="height: 400px;">
                            <canvas id="chartMetas"></canvas>
                        </div>
                    </div>
                    <div class="card">
                        <h3 style="margin-bottom: 14px; color: #1f2937; font-size: 0.95rem; font-weight: 600;">
                            <i class="fas fa-tasks"></i> Afazeres por Vendedor
                        </h3>
                        <div class="chart-container">
                            <canvas id="chartAfazeres"></canvas>
                        </div>
                    </div>
                </div>
            `;

            // Preparar dados
            const labels = [];
            const datasetCashback = [];
            const datasetAfazeres = [];
            const cores = [];

            vendedores.forEach(vendedor => {
                if (totaisPorVendedor[vendedor.id].cashback > 0 || totaisPorVendedor[vendedor.id].avaliacoes > 0 || totaisPorVendedor[vendedor.id].afazeres > 0) {
                    labels.push(vendedor.nome);
                    datasetCashback.push(totaisPorVendedor[vendedor.id].cashback);
                    datasetAfazeres.push(totaisPorVendedor[vendedor.id].afazeres);
                    cores.push(vendedor.cor);
                }
            });

            // Gráfico Afazeres
            new Chart(document.getElementById('chartAfazeres'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Afazeres Realizados',
                        data: datasetAfazeres,
                        backgroundColor: cores,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleColor: '#fff',
                            bodyColor: '#fff'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0, 0, 0, 0.06)' },
                            ticks: { color: '#6b7280' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#6b7280' }
                        }
                    }
                }
            });

            // Gráfico de Cashback por Vendedor
            new Chart(document.getElementById('chartMetas'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Cashback',
                        data: datasetCashback,
                        backgroundColor: cores,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleColor: '#fff',
                            bodyColor: '#fff'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0, 0, 0, 0.06)' },
                            ticks: { color: '#6b7280' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#6b7280' }
                        }
                    }
                }
            });
        }

        // ============================
        // NOVO GRÁFICO: Análise de Tarefas por Funcionário
        // ============================
        function gerarGraficoTarefas() {
            const vendedorId = document.getElementById('vendedorGraficoTarefas').value;
            if (!vendedorId) {
                showToast('⚠️ Por favor, selecione um funcionário!', 'warning');
                return;
            }

            const vendedor = vendedores.find(v => v.id == vendedorId);
            if (!vendedor) {
                showToast('⚠️ Funcionário não encontrado!', 'error');
                return;
            }

            // Calcular data de 4 semanas atrás
            const hoje = new Date(obterDataLocal());
            const quatroSemanasAtras = new Date(hoje);
            quatroSemanasAtras.setDate(quatroSemanasAtras.getDate() - 28);

            // Filtrar tarefas do vendedor nos últimos 28 dias
            const tarefasFiltradas = tarefas.filter(t => {
                if (t.vendedorId != vendedorId) return false;
                const dataTarefa = new Date(t.data);
                return dataTarefa >= quatroSemanasAtras && dataTarefa <= hoje;
            });

            if (tarefasFiltradas.length === 0) {
                document.getElementById('graficoTarefasContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-line"></i>
                        <p>Nenhuma tarefa encontrada para este funcionário nas últimas 4 semanas</p>
                    </div>
                `;
                return;
            }

            // Agrupar por descrição e contar ocorrências
            const tarefasPorDescricao = {};
            const diasSemanaPorTarefa = {};

            tarefasFiltradas.forEach(t => {
                if (!tarefasPorDescricao[t.descricao]) {
                    tarefasPorDescricao[t.descricao] = 0;
                    diasSemanaPorTarefa[t.descricao] = new Set();
                }
                tarefasPorDescricao[t.descricao]++;
                
                // Pegar dia da semana da tarefa (0 = Domingo, 6 = Sábado)
                const diaSemana = new Date(t.data + 'T00:00:00').getDay();
                diasSemanaPorTarefa[t.descricao].add(diaSemana);
            });

            // Ordenar tarefas por quantidade (mais realizadas primeiro)
            const tarefasOrdenadas = Object.keys(tarefasPorDescricao)
                .sort((a, b) => tarefasPorDescricao[b] - tarefasPorDescricao[a]);

            // Preparar dados para o gráfico
            const labels = tarefasOrdenadas;
            const data = tarefasOrdenadas.map(desc => tarefasPorDescricao[desc]);
            const cores = tarefasOrdenadas.map((_, i) => {
                const coresPaleta = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
                return coresPaleta[i % coresPaleta.length];
            });

            // Gerar HTML do gráfico
            const container = document.getElementById('graficoTarefasContainer');
            container.innerHTML = `
                <div class="card" style="margin-top: 20px;">
                    <h3 style="margin-bottom: 14px; color: var(--text); font-size: 0.95rem; font-weight: 600;">
                        <i class="fas fa-user" style="color: ${vendedor.cor};"></i> ${vendedor.nome} — Tarefas Mais Realizadas
                    </h3>
                    <div class="chart-container" style="height: 400px;">
                        <canvas id="chartTarefasFuncionario"></canvas>
                    </div>
                </div>

                <div class="card" style="margin-top: 20px;">
                    <h3 style="margin-bottom: 14px; color: var(--text); font-size: 0.95rem; font-weight: 600;">
                        <i class="fas fa-calendar-week"></i> Dias da Semana por Tarefa
                    </h3>
                    <div class="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>Tarefa</th>
                                    <th>Quantidade</th>
                                    <th>Dias da Semana</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tarefasOrdenadas.map(desc => {
                                    const quantidade = tarefasPorDescricao[desc];
                                    const dias = Array.from(diasSemanaPorTarefa[desc]).sort((a, b) => a - b);
                                    const diasNomes = dias.map(d => DIAS_SEMANA[d]).join(', ');
                                    return `
                                        <tr>
                                            <td><strong>${desc}</strong></td>
                                            <td><span class="status-badge status-concluido">${quantidade}x</span></td>
                                            <td>${diasNomes}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // Criar gráfico
            new Chart(document.getElementById('chartTarefasFuncionario'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Quantidade de Realizações',
                        data: data,
                        backgroundColor: cores,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleColor: '#fff',
                            bodyColor: '#fff'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0, 0, 0, 0.06)' },
                            ticks: { 
                                color: '#6b7280',
                                stepSize: 1
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { 
                                color: '#6b7280',
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    }
                }
            });

            showToast('📊 Gráfico gerado com sucesso!', 'success');
        }

        // ============================
        // TAREFAS (afazeres)
        // ============================
        function preencherSelectTarefaVendedor() {
            const select = document.getElementById('tarefaVendedor');
            select.innerHTML = '';
            vendedores.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.nome;
                select.appendChild(opt);
            });
        }

        function preencherSelectTarefaDescricao() {
            const select = document.getElementById('tarefaDescricao');
            select.innerHTML = '<option value="">Selecione um afazer...</option>';
            afazeresCadastrados.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.descricao;
                opt.textContent = a.descricao;
                select.appendChild(opt);
            });
        }

        function atualizarRelatorioSeAtivo() {
            if (document.getElementById('relatorios').classList.contains('active')) {
                gerarRelatorio();
            }
        }

        async function salvarTarefa(e) {
            e.preventDefault();
            const id = document.getElementById('tarefaId').value;
            const vendedorId = parseInt(document.getElementById('tarefaVendedor').value);
            const data = document.getElementById('tarefaData').value;
            const descricao = document.getElementById('tarefaDescricao').value.trim();
            const status = document.getElementById('tarefaStatus').value;

            if (id) {
                const t = tarefas.find(x => x.id == id);
                if (t) {
                    const oldDesc = t.descricao;
                    t.vendedorId = vendedorId;
                    t.data = data;
                    t.descricao = descricao;
                    t.status = status;
                    
                    // Atualizar também no array de registros para manter a consistência no relatório
                    let registroAtualizado = false;
                    registros.forEach(r => {
                        if (r.data === data && r.vendedorId === vendedorId && Array.isArray(r.tarefas)) {
                            if (r.tarefas.includes(oldDesc)) {
                                r.tarefas = r.tarefas.map(tDesc => tDesc === oldDesc ? descricao : tDesc);
                                registroAtualizado = true;
                            }
                        }
                    });
                    if (registroAtualizado) {
                        await salvarRegistros();
                    }
                }
            } else {
                tarefas.push({
                    id: Date.now(),
                    vendedorId,
                    data,
                    descricao,
                    status,
                    timestamp: new Date().toISOString(),
                    criadoEm: new Date()
                });
            }

            await salvarTarefas();
            closeTarefaModal();
            renderTarefasLista();
            renderDashboardEncarregado();
            atualizarRelatorioSeAtivo();
            showToast('Tarefa salva com sucesso!', 'success');
        }

        function editarTarefa(id) {
            const t = tarefas.find(x => x.id === id);
            if (!t) return;
            if (isTaskLocked(t)) {
                showToast('⚠️ Tarefa bloqueada: prazo de 72h expirado!', 'warning');
                return;
            }
            document.getElementById('tarefaModalTitle').textContent = 'Editar Tarefa';
            preencherSelectTarefaVendedor();
            preencherSelectTarefaDescricao();
            document.getElementById('tarefaId').value = t.id;
            document.getElementById('tarefaVendedor').value = t.vendedorId;
            document.getElementById('tarefaData').value = t.data;
            document.getElementById('tarefaDescricao').value = t.descricao;
            document.getElementById('tarefaStatus').value = t.status;
            document.getElementById('tarefaModal').classList.add('active');
        }

        async function excluirTarefa(id) {
            const t = tarefas.find(x => x.id === id);
            if (t && isTaskLocked(t)) {
                showToast('⚠️ Tarefa bloqueada: prazo de 72h expirado!', 'warning');
                return;
            }
            customConfirm('Excluir esta tarefa?', '🗑️ Excluir tarefa').then(async (ok) => {
                if (!ok) return;
                
                // Remover também do array de registros para manter a consistência no relatório
                if (t) {
                    registros.forEach(r => {
                        if (r.data === t.data && r.vendedorId === t.vendedorId && Array.isArray(r.tarefas)) {
                            r.tarefas = r.tarefas.filter(tDesc => tDesc !== t.descricao);
                        }
                    });
                    await salvarRegistros();
                }
                
                tarefas = tarefas.filter(task => task.id !== id);
                await salvarTarefas();
                renderTarefasLista();
                renderDashboardEncarregado();
                atualizarRelatorioSeAtivo();
                showToast('Tarefa excluída!', 'success');
            });
        }

        async function alternarStatusTarefa(id) {
            const t = tarefas.find(x => x.id === id);
            if (!t) return;
            if (isTaskLocked(t)) {
                showToast('⚠️ Tarefa bloqueada: prazo de 72h para alteração expirado!', 'warning');
                return;
            }
            const statuses = ['pendente', 'em_andamento', 'concluido', 'nao_realizado'];
            const currentIndex = statuses.indexOf(t.status);
            t.status = statuses[(currentIndex + 1) % statuses.length];
            await salvarTarefas();
            renderTarefasLista();
            renderDashboardEncarregado();
            atualizarRelatorioSeAtivo();
            showToast('Status atualizado!', 'success');
        }

        function renderTarefasLista() {
            const container = document.getElementById('tarefasLista');
            const fv = document.getElementById('filtroTarefaVendedor').value;
            const fd = document.getElementById('filtroTarefaData').value;

            let lista = [...tarefas];
            if (fv) lista = lista.filter(t => t.vendedorId == fv);
            if (fd) lista = lista.filter(t => t.data === fd);

            if (lista.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-tasks"></i>
                        <p>Nenhuma tarefa cadastrada</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Funcionário</th>
                            <th>Descrição</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            lista.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(t => {
                const v = vendedores.find(x => x.id === t.vendedorId);
                if (!v) return;
                const dataF = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
                
                let badgeClass = 'status-pendente';
                let badgeText = 'Pendente';
                let icon = 'fa-clock';
                
                if (t.status === 'concluido') { badgeClass = 'status-concluido'; badgeText = 'Concluído'; icon = 'fa-check'; }
                else if (t.status === 'em_andamento') { badgeClass = 'status-em_andamento'; badgeText = 'Em andamento'; icon = 'fa-spinner'; }
                else if (t.status === 'nao_realizado') { badgeClass = 'status-nao_realizado'; badgeText = 'Não realizado'; icon = 'fa-times'; }

                const locked = isTaskLocked(t);
                const lockedBadge = locked ? '<span class="status-badge status-bloqueado" style="margin-left:6px;"><i class="fas fa-lock"></i> Bloqueado</span>' : '';
                const badge = `<span class="status-badge ${badgeClass}"><i class="fas ${icon}"></i> ${badgeText}</span>${lockedBadge}`;

                const editBtn = locked 
                    ? `<button class="btn btn-secondary btn-small" disabled title="Prazo de 72h expirado"><i class="fas fa-lock"></i> Bloqueado</button>`
                    : `<button class="btn btn-secondary btn-small" onclick="editarTarefa(${t.id})"><i class="fas fa-edit"></i> Editar</button>`;
                    
                const deleteBtn = locked
                    ? ``
                    : `<button class="btn btn-danger btn-small" onclick="excluirTarefa(${t.id})"><i class="fas fa-trash"></i> Excluir</button>`;

                const toggleBtn = locked
                    ? `<button class="btn btn-secondary btn-small" disabled title="Prazo de 72h expirado"><i class="fas fa-lock"></i></button>`
                    : `<button class="btn btn-secondary btn-small" onclick="alternarStatusTarefa(${t.id})" title="Alternar status"><i class="fas fa-exchange-alt"></i> Alternar</button>`;

                html += `
                    <tr>
                        <td>${dataF}</td>
                        <td style="color:${v.cor}; font-weight:600;">
                            <i class="fas ${v.icone}"></i> ${v.nome}
                        </td>
                        <td>${t.descricao}</td>
                        <td>${badge}</td>
                        <td>
                            <div class="actions">
                                ${toggleBtn}
                                ${editBtn}
                                ${deleteBtn}
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
            container.innerHTML = html;
        }

        // ============================
        // DASHBOARD DO ENCARREGADO
        // ============================
        function renderDashboardEncarregado() {
            const container = document.getElementById('dashboardEncResultado');
            if (!container) return;

            const dataSelecionada = document.getElementById('dashboardData').value
                || obterDataLocal();
            const mesSelecionado = dataSelecionada.slice(0, 7);

            const regsDia = registros.filter(r => r.data === dataSelecionada);
            const regsMes = registros.filter(r => r.data.startsWith(mesSelecionado));
            const tarefasDia = tarefas.filter(t => t.data === dataSelecionada);

            const totalCashDia = regsDia.reduce((s, r) => s + r.cashback, 0);
            const totalAvalDia = regsDia.reduce((s, r) => s + r.avaliacoes, 0);
            const totalCashMes = regsMes.reduce((s, r) => s + r.cashback, 0);
            const totalAvalMes = regsMes.reduce((s, r) => s + r.avaliacoes, 0);
            const totalTarefas = tarefasDia.length;
            const tarefasConcluidas = tarefasDia.filter(t => t.status === 'concluido').length;
            const pctConcluidas = totalTarefas > 0 ? ((tarefasConcluidas / totalTarefas) * 100).toFixed(0) : 0;
            
            const pctCashMes = metaCashback > 0 ? ((totalCashMes / metaCashback) * 100).toFixed(1) : 0;
            const pctAvalMes = metaAvaliacoes > 0 ? ((totalAvalMes / metaAvaliacoes) * 100).toFixed(1) : 0;

            const dataF = new Date(dataSelecionada + 'T00:00:00').toLocaleDateString('pt-BR');

            let html = `
                <div class="dashboard-card" style="background: #eef2ff; border-color: #c7d2fe;">
                    <h4><i class="fas fa-calendar-day"></i> Relatório do dia ${dataF}</h4>
                    <div class="stats-grid">
                        <div class="stat-card" style="border-top: 3px solid #4CAF50;">
                            <i class="fas fa-gift" style="color:#4CAF50;"></i>
                            <div class="value" style="color:#4CAF50;">${totalCashDia}</div>
                            <div class="label">Cashback do dia</div>
                        </div>
                        <div class="stat-card" style="border-top: 3px solid #FFC107;">
                            <i class="fas fa-star" style="color:#FFC107;"></i>
                            <div class="value" style="color:#FFC107;">${totalAvalDia}</div>
                            <div class="label">Avaliações do dia</div>
                        </div>
                        <div class="stat-card" style="border-top: 3px solid #667eea;">
                            <i class="fas fa-gift" style="color:#667eea;"></i>
                            <div class="value" style="color:#667eea;">${totalCashMes}</div>
                            <div class="label">Cashback do mês (Meta: ${metaCashback} | ${pctCashMes}%)</div>
                        </div>
                        <div class="stat-card" style="border-top: 3px solid #e74c3c;">
                            <i class="fas fa-star" style="color:#e74c3c;"></i>
                            <div class="value" style="color:#e74c3c;">${totalAvalMes}</div>
                            <div class="label">Avaliações do mês (Meta: ${metaAvaliacoes} | ${pctAvalMes}%)</div>
                        </div>
                        <div class="stat-card" style="border-top: 3px solid #2ecc71;">
                            <i class="fas fa-tasks" style="color:#2ecc71;"></i>
                            <div class="value" style="color:#2ecc71;">${tarefasConcluidas}/${totalTarefas}</div>
                            <div class="label">Tarefas concluídas (${pctConcluidas}%)</div>
                        </div>
                    </div>
                </div>
            `;

            html += '<h3 style="color:#1f2937; margin: 24px 0 14px; font-size:1rem; font-weight:600;"><i class="fas fa-user-clock"></i> Por funcionário</h3>';

            if (vendedores.length === 0) {
                html += '<div class="empty-state"><i class="fas fa-users-slash"></i><p>Nenhum funcionário cadastrado</p></div>';
                container.innerHTML = html;
                return;
            }

            vendedores.forEach(v => {
                const regsV = regsDia.filter(r => r.vendedorId === v.id);
                const tarefasV = tarefasDia.filter(t => t.vendedorId === v.id);
                const cashV = regsV.reduce((s, r) => s + r.cashback, 0);
                const avalV = regsV.reduce((s, r) => s + r.avaliacoes, 0);
                const concV = tarefasV.filter(t => t.status === 'concluido').length;

                html += `
                    <div class="dashboard-card" style="border-left: 4px solid ${v.cor};">
                        <h4 style="color:${v.cor};">
                            <i class="fas ${v.icone}"></i> ${v.nome}
                        </h4>
                        <div class="totais-row">
                            <span><i class="fas fa-gift"></i> Cashback: <strong>${cashV}</strong></span>
                            <span><i class="fas fa-star"></i> Avaliações: <strong>${avalV}</strong></span>
                            <span><i class="fas fa-tasks"></i> Tarefas: <strong>${concV}/${tarefasV.length}</strong></span>
                        </div>
                        <div style="margin-top: 15px;">
                            ${tarefasV.length === 0
                                ? '<p style="color:#9ca3af; font-style:italic;">Sem tarefas para este dia</p>'
                                : tarefasV.map(t => {
                                    let statusIcon = 'fa-circle';
                                    let statusColor = '#ffc107';
                                    let statusLabel = 'Pendente';
                                    let isConcluida = '';
                                    
                                    if (t.status === 'concluido') {
                                        statusIcon = 'fa-check-circle'; statusColor = '#4CAF50'; statusLabel = 'Concluído'; isConcluida = 'concluida';
                                    } else if (t.status === 'em_andamento') {
                                        statusIcon = 'fa-spinner'; statusColor = '#3b82f6'; statusLabel = 'Em andamento';
                                    } else if (t.status === 'nao_realizado') {
                                        statusIcon = 'fa-times-circle'; statusColor = '#ef4444'; statusLabel = 'Não realizado';
                                    }
                                    
                                    return `
                                    <div class="tarefa-item ${isConcluida}">
                                        <div>
                                            <i class="fas ${statusIcon}" style="color:${statusColor}; margin-right:8px;"></i>
                                            ${t.descricao}
                                        </div>
                                        <span class="status-badge status-${t.status}">
                                            ${statusLabel}
                                        </span>
                                    </div>
                                    `;
                                }).join('')
                            }
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        function closeTarefaModal() {
            document.getElementById('tarefaModal').classList.remove('active');
        }

        // ============================
        // CADASTRO DE AFAZERES (templates)
        // ============================
        function renderDiasSemanaChecks() {
            const c = document.getElementById('diasSemanaChecks');
            if (!c) return;
            c.innerHTML = DIAS_SEMANA.map((d, i) => `
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                    <input type="checkbox" class="diaSemanaCheck" value="${i}">
                    <span>${d}</span>
                </label>
            `).join('');
        }

        function abrirAfazerCadastroModal(afazer = null) {
            const titulo = document.getElementById('afazerCadastroModalTitle');
            renderDiasSemanaChecks();
            if (afazer) {
                titulo.textContent = '✏️ Editar Afazer';
                document.getElementById('afazerCadastroId').value = afazer.id;
                document.getElementById('afazerCadastroDescricao').value = afazer.descricao;
                document.getElementById('afazerCadastroRecorrencia').value = afazer.recorrencia;
                if (afazer.recorrencia === 'semanal' && afazer.diasSemana) {
                    document.querySelectorAll('.diaSemanaCheck').forEach(ch => {
                        ch.checked = afazer.diasSemana.includes(parseInt(ch.value));
                    });
                }
            } else {
                titulo.textContent = '➕ Cadastrar Afazer';
                document.getElementById('afazerCadastroId').value = '';
                document.getElementById('afazerCadastroDescricao').value = '';
                document.getElementById('afazerCadastroRecorrencia').value = 'diaria';
            }
            document.getElementById('afazerDiasSemanaGroup').style.display =
                document.getElementById('afazerCadastroRecorrencia').value === 'semanal' ? 'block' : 'none';
            document.getElementById('afazerCadastroModal').classList.add('active');
        }

        async function salvarAfazerCadastro(e) {
            e.preventDefault();
            const id = document.getElementById('afazerCadastroId').value;
            const descricao = document.getElementById('afazerCadastroDescricao').value.trim();
            const recorrencia = document.getElementById('afazerCadastroRecorrencia').value;
            let diasSemana = [];
            if (recorrencia === 'semanal') {
                diasSemana = Array.from(document.querySelectorAll('.diaSemanaCheck:checked')).map(c => parseInt(c.value));
                if (diasSemana.length === 0) {
                    showToast('⚠️ Selecione ao menos um dia da semana!', 'warning');
                    return;
                }
            }
            if (id) {
                const a = afazeresCadastrados.find(x => x.id == id);
                if (a) { a.descricao = descricao; a.recorrencia = recorrencia; a.diasSemana = diasSemana; }
            } else {
                afazeresCadastrados.push({
                    id: Date.now(),
                    descricao,
                    recorrencia,
                    diasSemana
                });
            }
            await salvarAfazeresCadastrados();
            closeAfazerCadastroModal();
            renderAfazeresCadastroLista();
            renderAfazeresCheckboxes();
            showToast('✅ Afazer salvo!', 'success');
        }

        function editarAfazerCadastro(id) {
            const a = afazeresCadastrados.find(x => x.id === id);
            if (a) abrirAfazerCadastroModal(a);
        }

        async function excluirAfazerCadastro(id) {
            customConfirm('Excluir este afazer cadastrado?', '🗑️ Excluir afazer').then(async (ok) => {
                if (!ok) return;
                afazeresCadastrados = afazeresCadastrados.filter(a => a.id !== id);
                await salvarAfazeresCadastrados();
                renderAfazeresCadastroLista();
                renderAfazeresCheckboxes();
                showToast('Afazer excluído!', 'success');
            });
        }

        function renderAfazeresCadastroLista() {
            const c = document.getElementById('afazeresCadastroLista');
            if (!c) return;
            if (afazeresCadastrados.length === 0) {
                c.innerHTML = '<div class="empty-state">📭<p>Nenhum afazer cadastrado</p></div>';
                return;
            }
            let html = `
                <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>📝 Descrição</th>
                            <th>🔁 Recorrência</th>
                            <th>📌 Dias</th>
                            <th>⚙️ Ações</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            afazeresCadastrados.forEach(a => {
                let recLabel = '';
                if (a.recorrencia === 'diaria') recLabel = '📅 Diária';
                else if (a.recorrencia === 'semanal') recLabel = '🗓️ Semanal';
                else recLabel = '🔹 Avulsa';
                const dias = a.recorrencia === 'semanal' && a.diasSemana
                    ? a.diasSemana.map(d => DIAS_SEMANA[d]).join(', ')
                    : '—';
                html += `
                    <tr>
                        <td>${a.descricao}</td>
                        <td>${recLabel}</td>
                        <td>${dias}</td>
                        <td>
                            <div class="actions">
                                <button class="btn btn-secondary btn-small" onclick="editarAfazerCadastro(${a.id})">✏️ Editar</button>
                                <button class="btn btn-danger btn-small" onclick="excluirAfazerCadastro(${a.id})">🗑️ Excluir</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
            c.innerHTML = html;
        }

        function closeAfazerCadastroModal() {
            document.getElementById('afazerCadastroModal').classList.remove('active');
        }

        // Funções de modal
        function closeConfigModal() {
            document.getElementById('configModal').classList.remove('active');
        }

        function closeEditarRegistroModal() {
            document.getElementById('editarRegistroModal').classList.remove('active');
        }

        function verificarSenhaAba() {
            const senha = document.getElementById('senhaAbaInput').value;
            if (senha === SENHA_SISTEMA) {
                closeSenhaAbaModal();
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
                
                // Determine which tab was requested (we can check which tab triggered it, but since we blocked it, we can just default to tarefas or gerenciar based on a flag, or simpler: just unlock both or check the last clicked tab. 
                // Actually, a simpler way: we can store the requested tab in a variable.
                if (requestedTab === 'tarefas') {
                    tarefasDesbloqueado = true;
                    document.querySelector('.tab[data-tab="tarefas"]').classList.add('active');
                    document.getElementById('tarefas').classList.add('active');
                    renderTarefasLista();
                } else if (requestedTab === 'gerenciar') {
                    gerenciarDesbloqueado = true;
                    document.querySelector('.tab[data-tab="gerenciar"]').classList.add('active');
                    document.getElementById('gerenciar').classList.add('active');
                    renderGerenciarLista();
                }
                // Atualiza label e fecha drawer mobile
                const _ativa = document.querySelector('.tab.active');
                const _lbl = document.getElementById('tabsToggleLabel');
                if (_ativa && _lbl) _lbl.textContent = _ativa.textContent.trim();
                const _drawer = document.getElementById('adminTabs');
                const _ov = document.getElementById('tabsOverlay');
                if (_drawer) _drawer.classList.remove('open');
                if (_ov) _ov.classList.remove('active');
                showToast('✅ Acesso concedido!', 'success');
            } else {
                showToast('⚠️ Senha incorreta!', 'error');
            }
        }

        let requestedTab = '';

        function closeSenhaAbaModal() {
            document.getElementById('senhaAbaModal').classList.remove('active');
        }

        function togglePassword() { /* removido */ }

        // Inicializar
        init();
    
