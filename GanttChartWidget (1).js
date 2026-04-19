(function () {
    let tmpl = document.createElement('template');
    tmpl.innerHTML = `
    <style>
        :host {
            display: block;
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        #chart {
            border: 1px solid #dde3ea;
            width: 100%;
            height: 600px;
            overflow: hidden;
            box-sizing: border-box;
        }
        .gantt_container {
            font-family: 'Segoe UI', Arial, sans-serif !important;
        }
        .gantt_grid_head_cell,
        .gantt_column_header {
            background-color: #1a3a5c !important;
            color: #ffffff !important;
            font-weight: 600 !important;
            font-size: 12px !important;
        }
        .gantt_task_line { border-radius: 3px !important; }
        .gantt_task_line.status_inprogress  { background-color: #0070d2 !important; border-color: #005ba3 !important; }
        .gantt_task_line.status_notstarted  { background-color: #f4a261 !important; border-color: #e76f2a !important; }
        .gantt_task_line.status_completed   { background-color: #2ecc71 !important; border-color: #27ae60 !important; }
        .gantt_task_line.status_onhold      { background-color: #e74c3c !important; border-color: #c0392b !important; }
        .gantt_row:hover .gantt_cell,
        .gantt_row.odd:hover .gantt_cell    { background-color: #eaf4ff !important; }
        .gantt_row.odd .gantt_cell          { background-color: #f7f9fc !important; }
        .gantt_scale_cell                   { background-color: #2c5282 !important; color: #ffffff !important; font-weight: 500 !important; }
        .gantt_scale_line                   { background-color: #2c5282 !important; }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }
        .status-badge.in-progress  { background-color: #d4eaff; color: #005ba3; }
        .status-badge.not-started  { background-color: #fff3e0; color: #e65100; }
        .status-badge.completed    { background-color: #e8f5e9; color: #1b5e20; }
        .status-badge.on-hold      { background-color: #fce4ec; color: #880e4f; }
    </style>
    <div id="chart"></div>
    `;

    class GanttChartWidget extends HTMLElement {

        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: 'open' });
            this._shadowRoot.appendChild(tmpl.content.cloneNode(true));
            this._props   = {};
            this.tasks    = [];
            this._ready   = false;
            this._dataSet = false;

            const css  = document.createElement('link');
            css.rel    = 'stylesheet';
            css.href   = 'https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.css';
            this._shadowRoot.appendChild(css);

            const script  = document.createElement('script');
            script.src    = 'https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js';
            script.onload = () => {
                this._ready = true;
                this._dataSet ? this._renderChart() : this._renderSample();
            };
            this._shadowRoot.appendChild(script);
        }

        // ── SAC data binding setter ────────────────────────────────────────
        set myDataBinding(dataBinding) {
            this._myDataBinding = dataBinding;
            this._parseDataBinding(dataBinding);
        }
        get myDataBinding() { return this._myDataBinding; }

        // ── Parse SAC dataBinding ──────────────────────────────────────────
        // Dimensions:  Appr_Requests, Investment_Reason, Priority, Phase,
        //              Project_Manager, Financial_Analyst, Technical_Analyst,
        //              Implementation_Date, Start_Date, End_Date
        // Measures:    Duration  (restricted measure)
        _parseDataBinding(dataBinding) {
            if (!dataBinding || !dataBinding.data) return;

            try {
                const data     = dataBinding.data;
                const metadata = dataBinding.metadata;

                const dimIdx = {};
                const meaIdx = {};

                if (metadata && metadata.feeds) {
                    const dimFeed = metadata.feeds.find(f => f.id === 'dimensions');
                    const meaFeed = metadata.feeds.find(f => f.id === 'measures');
                    if (dimFeed && dimFeed.values) dimFeed.values.forEach((n, i) => { dimIdx[n] = i; });
                    if (meaFeed && meaFeed.values) meaFeed.values.forEach((n, i) => { meaIdx[n] = i; });
                }

                // Safe dimension cell extractor
                const dim = (row, key) => {
                    const i = dimIdx[key];
                    if (i === undefined) return null;
                    const cell = (row.dimensions || [])[i];
                    if (!cell && cell !== 0) return null;
                    return typeof cell === 'object' ? (cell.label || cell.id || '') : String(cell);
                };

                // Safe measure cell extractor
                const mea = (row, key) => {
                    const i = meaIdx[key];
                    if (i === undefined) return null;
                    const cell = (row.measures || [])[i];
                    if (cell === null || cell === undefined) return null;
                    return typeof cell === 'object' ? (cell.raw ?? cell.formatted ?? 0) : Number(cell);
                };

                const parsedTasks = [];

                data.forEach((row, idx) => {
                    // ── Dimensions ──────────────────────────────────────────
                    const apprRequest      = dim(row, 'Appr_Requests')      || `Request ${idx + 1}`;
                    const investmentReason = dim(row, 'Investment_Reason')  || '';
                    const priority         = dim(row, 'Priority')           || '';
                    const phase            = dim(row, 'Phase')              || '';
                    const projectManager   = dim(row, 'Project_Manager')    || '';
                    const financialAnalyst = dim(row, 'Financial_Analyst')  || '';
                    const technicalAnalyst = dim(row, 'Technical_Analyst')  || '';
                    const implDateRaw      = dim(row, 'Implementation_Date')|| '';
                    const startRaw         = dim(row, 'Start_Date')         || '';
                    const endRaw           = dim(row, 'End_Date')           || '';

                    // ── Measures ────────────────────────────────────────────
                    const durationVal = mea(row, 'Duration') ?? 1;

                    // ── Parse dates ─────────────────────────────────────────
                    const startDate = this._parseDate(startRaw);
                    const endDate   = this._parseDate(endRaw);
                    const implDate  = this._parseDate(implDateRaw);

                    if (!startDate) return;

                    parsedTasks.push({
                        id:                idx + 1,
                        text:              apprRequest,
                        appr_request:      apprRequest,
                        investment_reason: investmentReason,
                        priority:          priority,
                        phase:             phase,
                        project_manager:   projectManager,
                        financial_analyst: financialAnalyst,
                        technical_analyst: technicalAnalyst,
                        impl_date:         implDate,
                        start_date:        startDate,
                        end_date:          endDate,
                        duration:          Number(durationVal) || 1,
                        statusClass:       this._phaseToClass(phase),
                        color:             this._phaseToColor(phase)
                    });
                });

                if (parsedTasks.length > 0) {
                    this.tasks    = parsedTasks;
                    this._dataSet = true;
                    if (this._ready) this._renderChart();
                }

            } catch (e) {
                console.warn('[GanttChartWidget] Error parsing dataBinding:', e);
            }
        }

        // ── Phase → CSS class ──────────────────────────────────────────────
        _phaseToClass(phase) {
            const p = (phase || '').toLowerCase();
            if (p.includes('progress') || p.includes('active')) return 'status_inprogress';
            if (p.includes('complet')  || p.includes('done'))   return 'status_completed';
            if (p.includes('hold')     || p.includes('block'))  return 'status_onhold';
            return 'status_notstarted';
        }

        // ── Phase → bar colour ─────────────────────────────────────────────
        _phaseToColor(phase) {
            const p = (phase || '').toLowerCase();
            if (p.includes('progress') || p.includes('active')) return '#0070d2';
            if (p.includes('complet')  || p.includes('done'))   return '#2ecc71';
            if (p.includes('hold')     || p.includes('block'))  return '#e74c3c';
            return '#f4a261';
        }

        // ── Date parser (handles SAC formats) ─────────────────────────────
        _parseDate(raw) {
            if (!raw) return null;
            if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
            const s = String(raw).trim();
            if (/^\d{8}$/.test(s))            // YYYYMMDD  (SAC compact)
                return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) // YYYY-MM-DD
                return new Date(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10));
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { // DD/MM/YYYY
                const [d,m,y] = s.split('/');
                return new Date(+y, +m-1, +d);
            }
            const fd = new Date(s);
            return isNaN(fd.getTime()) ? null : fd;
        }

        // ── Sample data shown before SAC data arrives ──────────────────────
        _renderSample() {
            this.tasks = [
                {
                    id: 1, text: 'Sample Request A', appr_request: 'Sample Request A',
                    investment_reason: 'Expansion', priority: 'High', phase: 'In Progress',
                    project_manager: 'Manager 1', financial_analyst: 'Analyst 1', technical_analyst: 'Tech 1',
                    impl_date: new Date(2026,5,1), start_date: new Date(2026,2,1), end_date: new Date(2026,2,15),
                    duration: 14, statusClass: 'status_inprogress', color: '#0070d2'
                },
                {
                    id: 2, text: 'Sample Request B', appr_request: 'Sample Request B',
                    investment_reason: 'Maintenance', priority: 'Medium', phase: 'Not Started',
                    project_manager: 'Manager 2', financial_analyst: 'Analyst 2', technical_analyst: 'Tech 2',
                    impl_date: new Date(2026,6,1), start_date: new Date(2026,3,1), end_date: new Date(2026,3,20),
                    duration: 19, statusClass: 'status_notstarted', color: '#f4a261'
                },
                {
                    id: 3, text: 'Sample Request C', appr_request: 'Sample Request C',
                    investment_reason: 'New Project', priority: 'Low', phase: 'Completed',
                    project_manager: 'Manager 3', financial_analyst: 'Analyst 3', technical_analyst: 'Tech 3',
                    impl_date: new Date(2026,4,15), start_date: new Date(2026,1,10), end_date: new Date(2026,1,28),
                    duration: 18, statusClass: 'status_completed', color: '#2ecc71'
                }
            ];
            this._renderChart();
        }

        // ── Main render ────────────────────────────────────────────────────
        _renderChart() {
            if (!this._ready) return;
            const chartDiv = this._shadowRoot.getElementById('chart');
            if (!chartDiv) return;
            chartDiv.style.height = (this._props.height || 600) + 'px';

            const gantt = window.gantt;
            if (!gantt) return;

            gantt.config.columns = [
                {
                    name: 'text', label: 'Approval Request', width: 200, tree: true,
                    template: t => `<span title="${t.text}">${t.text}</span>`
                },
                {
                    name: 'phase', label: 'Phase', align: 'center', width: 100,
                    template: t => {
                        const cls = this._phaseToClass(t.phase);
                        let badge = 'not-started';
                        if (cls === 'status_inprogress') badge = 'in-progress';
                        else if (cls === 'status_completed') badge = 'completed';
                        else if (cls === 'status_onhold')    badge = 'on-hold';
                        return `<span class="status-badge ${badge}">${t.phase || ''}</span>`;
                    }
                },
                { name: 'priority',          label: 'Priority',        align: 'center', width: 70,  template: t => t.priority || '' },
                { name: 'investment_reason', label: 'Inv. Reason',     width: 110,                  template: t => t.investment_reason || '' },
                { name: 'project_manager',   label: 'Project Mgr',     width: 110,                  template: t => t.project_manager || '' },
                { name: 'financial_analyst', label: 'Fin. Analyst',    width: 100,                  template: t => t.financial_analyst || '' },
                { name: 'technical_analyst', label: 'Tech. Analyst',   width: 100,                  template: t => t.technical_analyst || '' },
                { name: 'impl_date',         label: 'Impl. Date', align: 'center', width: 85,       template: t => this._fmtDate(t.impl_date) },
                { name: 'start_date',        label: 'Start',      align: 'center', width: 80,       template: t => this._fmtDate(t.start_date) },
                {
                    name: 'end_date', label: 'End', align: 'center', width: 80,
                    template: t => {
                        if (t.end_date) return this._fmtDate(t.end_date);
                        if (t.start_date && t.duration) {
                            const d = new Date(t.start_date);
                            d.setDate(d.getDate() + Number(t.duration));
                            return this._fmtDate(d);
                        }
                        return '';
                    }
                },
                { name: 'duration', label: 'Days', align: 'center', width: 50 }
            ];

            gantt.config.scales = [
                { unit: 'month', step: 1, format: '%F %Y' },
                { unit: 'week',  step: 1, format: 'W%W'   }
            ];

            gantt.config.date_format         = '%Y-%m-%d';
            gantt.config.row_height          = 36;
            gantt.config.bar_height          = 22;
            gantt.config.duration_unit       = 'day';
            gantt.config.fit_tasks           = true;
            gantt.config.show_errors         = false;
            gantt.config.readonly            = true;
            gantt.config.show_progress       = false;
            gantt.config.show_links          = false;
            gantt.config.open_tree_initially = true;

            gantt.templates.task_class = (s, e, t) => t.statusClass || '';
            gantt.templates.task_style = (s, e, t) => {
                const c = t.color || '#0070d2';
                return `background-color:${c}; border-color:${c};`;
            };
            gantt.templates.tooltip_text = (start, end, t) =>
                `<b>${t.text}</b><br/>
                 Phase: ${t.phase || 'N/A'}<br/>
                 Priority: ${t.priority || 'N/A'}<br/>
                 Investment Reason: ${t.investment_reason || 'N/A'}<br/>
                 Project Manager: ${t.project_manager || 'N/A'}<br/>
                 Financial Analyst: ${t.financial_analyst || 'N/A'}<br/>
                 Technical Analyst: ${t.technical_analyst || 'N/A'}<br/>
                 Impl. Date: ${this._fmtDate(t.impl_date)}<br/>
                 Start: ${this._fmtDate(start)} &nbsp; End: ${this._fmtDate(end)}<br/>
                 Duration: ${t.duration} days`;

            gantt.init(chartDiv);
            gantt.clearAll();
            gantt.parse({
                data: this.tasks.map(t => ({
                    id:                t.id,
                    text:              t.text,
                    start_date:        this._toStr(t.start_date),
                    end_date:          t.end_date ? this._toStr(t.end_date) : null,
                    duration:          t.duration,
                    phase:             t.phase,
                    priority:          t.priority,
                    investment_reason: t.investment_reason,
                    project_manager:   t.project_manager,
                    financial_analyst: t.financial_analyst,
                    technical_analyst: t.technical_analyst,
                    impl_date:         t.impl_date,
                    statusClass:       t.statusClass,
                    color:             t.color
                })),
                links: []
            });

            gantt.attachEvent('onTaskClick', (id) => {
                const task = gantt.getTask(id);
                this.dispatchEvent(new CustomEvent('onTaskClick', { bubbles: true, detail: { taskId: id, taskData: task } }));
                return true;
            });
            gantt.attachEvent('onTaskSelected', (id) => {
                this.dispatchEvent(new CustomEvent('onTaskSelect', { bubbles: true, detail: { taskId: id } }));
            });
        }

        // ── Date utilities ─────────────────────────────────────────────────
        _fmtDate(date) {
            if (!date) return '';
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return '';
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        }
        _toStr(date) {
            if (!date) return null;
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        // ── SAC property bridge ────────────────────────────────────────────
        set width(v)  { this._props.width  = v; }
        get width()   { return this._props.width; }
        set height(v) { this._props.height = v; const c = this._shadowRoot.getElementById('chart'); if (c) c.style.height = v + 'px'; }
        get height()  { return this._props.height; }
        set showDependencies(v) { this._props.showDependencies = v; }
        get showDependencies()  { return this._props.showDependencies; }
        set dateFormat(v) { this._props.dateFormat = v; }
        get dateFormat()  { return this._props.dateFormat; }
        set primaryColor(v) { this._props.primaryColor = v; }
        get primaryColor()  { return this._props.primaryColor; }

        setTasks(tasksArray) { this.tasks = tasksArray; this._dataSet = true; if (this._ready) this._renderChart(); }
        refreshData()        { if (this._ready) this._renderChart(); }
    }

    customElements.define('gantt-chart-widget', GanttChartWidget);
})();
