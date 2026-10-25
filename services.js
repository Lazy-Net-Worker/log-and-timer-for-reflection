"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportApplicationService = exports.LogQueryApplicationService = exports.LogEditApplicationService = exports.TaskMasterApplicationService = exports.TimerApplicationService = void 0;
const obsidian_1 = require("obsidian");
const utils_1 = require("./utils");
const export_1 = require("./export");
function createLog(start, end, task, memo = '', id = (0, utils_1.makeId)('log')) {
    const durationSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    return {
        id,
        startTime: (0, utils_1.nowIso)(start),
        endTime: (0, utils_1.nowIso)(end),
        durationSec,
        task,
        memo,
        createdAt: (0, utils_1.nowIso)(),
        updatedAt: (0, utils_1.nowIso)(),
    };
}
class TimerApplicationService {
    constructor(logRepo, taskRepo, timerRepo) {
        this.logRepo = logRepo;
        this.taskRepo = taskRepo;
        this.timerRepo = timerRepo;
    }
    async start(taskId, now) {
        await this.startStopwatch(taskId, now);
    }
    async startStopwatch(taskId, now) {
        const task = await this.taskRepo.findById(taskId);
        if (!task)
            throw new Error('Task not found');
        const state = await this.timerRepo.get();
        if (state.status !== 'idle')
            return;
        await this.timerRepo.save({
            status: 'running',
            mode: 'stopwatch',
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: 0,
            targetSec: null,
            remainingSec: null,
            pomodoroPhase: null,
            pomodoroRound: 0,
            currentTask: (0, utils_1.toTaskRef)(task),
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async startPomodoro(taskId, now, settings) {
        const task = await this.taskRepo.findById(taskId);
        if (!task)
            throw new Error('Task not found');
        const state = await this.timerRepo.get();
        if (state.status !== 'idle')
            return;
        const remainingSec = Math.max(1, Math.round(settings.pomodoroWorkMinutes * 60));
        await this.timerRepo.save({
            status: 'running',
            mode: 'pomodoro',
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: 0,
            targetSec: remainingSec,
            remainingSec,
            pomodoroPhase: 'work',
            pomodoroRound: 1,
            currentTask: (0, utils_1.toTaskRef)(task),
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async startInversePomodoro(taskId, now, settings) {
        const task = await this.taskRepo.findById(taskId);
        if (!task)
            throw new Error('Task not found');
        const state = await this.timerRepo.get();
        if (state.status !== 'idle')
            return;
        await this.timerRepo.save({
            status: 'running',
            mode: 'inverse-pomodoro',
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: 0,
            targetSec: null,
            remainingSec: null,
            pomodoroPhase: 'work',
            pomodoroRound: 1,
            currentTask: (0, utils_1.toTaskRef)(task),
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async startInversePomodoroBreak(now, settings) {
        const state = await this.timerRepo.get();
        if (state.mode !== 'inverse-pomodoro' || state.status !== 'running' || state.pomodoroPhase !== 'work' || !state.startTime || !state.currentTask)
            return;
        const startedAt = (0, utils_1.parseStoredDate)(state.startTime);
        if (!startedAt)
            return;
        const workElapsedSec = state.elapsedSec + Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        const breakSec = Math.max(1, Math.round(workElapsedSec * settings.inversePomodoroBreakRatio));
        await this.timerRepo.save({
            ...state,
            status: 'running',
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: state.sessionElapsedSec + workElapsedSec,
            targetSec: breakSec,
            remainingSec: breakSec,
            pomodoroPhase: 'break',
            pomodoroRound: state.pomodoroRound,
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async pause(now) {
        const state = await this.timerRepo.get();
        if (state.status !== 'running' || !state.startTime)
            return;
        const startedAt = (0, utils_1.parseStoredDate)(state.startTime);
        if (!startedAt)
            return;
        const phaseElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        const remainingSec = state.remainingSec === null ? null : Math.max(0, state.remainingSec - phaseElapsed);
        await this.timerRepo.save({ ...state, status: 'paused', startTime: (0, utils_1.nowIso)(now), elapsedSec: phaseElapsed, sessionElapsedSec: state.sessionElapsedSec + phaseElapsed, remainingSec, updatedAt: (0, utils_1.nowIso)(now) });
    }
    async resume(now) {
        const state = await this.timerRepo.get();
        if (state.status !== 'paused')
            return;
        await this.timerRepo.save({ ...state, status: 'running', startTime: (0, utils_1.nowIso)(now), updatedAt: (0, utils_1.nowIso)(now) });
    }
    async reset(now, memo = '') {
        const state = await this.timerRepo.get();
        if (state.status === 'idle' || !state.currentTask)
            return;
        await this.logRepo.save(this.finalize(state, now, memo));
        await this.timerRepo.save({ status: 'idle', mode: 'stopwatch', startTime: null, elapsedSec: 0, sessionElapsedSec: 0, targetSec: null, remainingSec: null, pomodoroPhase: null, pomodoroRound: 0, currentTask: null, updatedAt: (0, utils_1.nowIso)(now) });
    }
    async resumeInverseWork(now) {
        const state = await this.timerRepo.get();
        if (state.mode !== 'inverse-pomodoro' || state.status !== 'running' || state.pomodoroPhase !== 'break')
            return;
        const startedAt = (0, utils_1.parseStoredDate)(state.startTime) ?? now;
        const breakElapsedSec = state.elapsedSec + Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        await this.timerRepo.save({
            ...state,
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: state.sessionElapsedSec + breakElapsedSec,
            targetSec: null,
            remainingSec: null,
            pomodoroPhase: 'work',
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async changeTask(taskId, now, memo = '') {
        const state = await this.timerRepo.get();
        const task = await this.taskRepo.findById(taskId);
        if (!task)
            throw new Error('Task not found');
        if (state.currentTask?.id === taskId)
            return;
        if (state.status !== 'idle' && state.currentTask && state.startTime) {
            await this.logRepo.save(this.finalize(state, now, memo));
        }
        await this.timerRepo.save({
            status: state.status,
            mode: state.mode,
            startTime: state.status === 'running' ? (0, utils_1.nowIso)(now) : state.startTime,
            elapsedSec: state.status === 'running' ? 0 : state.status === 'paused' ? 0 : state.elapsedSec,
            sessionElapsedSec: state.sessionElapsedSec,
            targetSec: state.targetSec,
            remainingSec: state.remainingSec,
            pomodoroPhase: state.pomodoroPhase,
            pomodoroRound: state.pomodoroRound,
            currentTask: (0, utils_1.toTaskRef)(task),
            updatedAt: (0, utils_1.nowIso)(now),
        });
    }
    async handleDateChange(now) {
        const state = await this.timerRepo.get();
        if (state.status === 'idle' || !state.currentTask || !state.startTime)
            return false;
        const startedAt = (0, utils_1.parseStoredDate)(state.startTime);
        if (!startedAt)
            return false;
        const startDate = (0, utils_1.formatDateKey)(startedAt);
        const currentDate = (0, utils_1.formatDateKey)(now);
        if (startDate === currentDate)
            return false;
        await this.logRepo.save(this.finalize(state, now));
        await this.timerRepo.save({
            status: state.status,
            mode: state.mode,
            startTime: (0, utils_1.nowIso)(now),
            elapsedSec: 0,
            sessionElapsedSec: state.sessionElapsedSec,
            targetSec: state.targetSec,
            remainingSec: state.remainingSec,
            pomodoroPhase: state.pomodoroPhase,
            pomodoroRound: state.pomodoroRound,
            currentTask: state.currentTask,
            updatedAt: (0, utils_1.nowIso)(now),
        });
        return true;
    }
    async tickCountdown(now, settings) {
        const state = await this.timerRepo.get();
        if (state.status !== 'running' || !state.startTime || state.mode === 'stopwatch')
            return false;
        const startedAt = (0, utils_1.parseStoredDate)(state.startTime);
        if (!startedAt)
            return false;
        const elapsedSinceStart = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        if (state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'work') {
            return false;
        }
        const remainingSec = Math.max(0, (state.remainingSec ?? 0) - elapsedSinceStart);
        if (remainingSec > 0)
            return false;
        if (state.mode === 'inverse-pomodoro' || state.mode === 'pomodoro') {
            const isWork = state.pomodoroPhase === 'work';
            const nextRound = isWork ? state.pomodoroRound : state.pomodoroRound + 1;
            const roundsLimit = settings.pomodoroInfinite ? Infinity : Math.max(1, Math.round(settings.pomodoroRounds));
            if (!isWork && nextRound > roundsLimit) {
                await this.timerRepo.save({
                    ...state,
                    status: 'completed',
                    startTime: (0, utils_1.nowIso)(now),
                    elapsedSec: state.elapsedSec + elapsedSinceStart,
                    sessionElapsedSec: state.sessionElapsedSec,
                    remainingSec: 0,
                    updatedAt: (0, utils_1.nowIso)(now),
                });
                new obsidian_1.Notice(state.mode === 'pomodoro' ? 'Pomodoro finished' : 'Reverse pomodoro finished');
                return true;
            }
            const nextPhase = isWork ? 'break' : 'work';
            const nextRemainingSec = state.mode === 'inverse-pomodoro'
                ? isWork
                    ? Math.max(1, Math.round((state.elapsedSec + elapsedSinceStart) * settings.inversePomodoroBreakRatio))
                    : null
                : Math.max(1, Math.round((isWork ? settings.pomodoroBreakMinutes : settings.pomodoroWorkMinutes) * 60));
            await this.timerRepo.save({
                ...state,
                startTime: (0, utils_1.nowIso)(now),
                elapsedSec: 0,
                sessionElapsedSec: state.sessionElapsedSec + elapsedSinceStart,
                targetSec: nextRemainingSec,
                remainingSec: nextRemainingSec,
                pomodoroPhase: nextPhase,
                pomodoroRound: nextRound,
                updatedAt: (0, utils_1.nowIso)(now),
            });
            new obsidian_1.Notice(nextPhase === 'break' ? 'Break started' : 'Work started');
            return true;
        }
        return false;
    }
    async onPluginUnload(now) {
        const state = await this.timerRepo.get();
        if (state.status !== 'idle' && state.currentTask && state.startTime) {
            await this.logRepo.save(this.finalize(state, now));
        }
        await this.timerRepo.save({ status: 'idle', mode: 'stopwatch', startTime: null, elapsedSec: 0, sessionElapsedSec: 0, targetSec: null, remainingSec: null, pomodoroPhase: null, pomodoroRound: 0, currentTask: null, updatedAt: (0, utils_1.nowIso)(now) });
    }
    getStateDTO(state) {
        return {
            status: state.status,
            mode: state.mode,
            elapsedSec: state.status === 'running' && state.startTime
                ? state.elapsedSec + Math.floor((Date.now() - ((0, utils_1.parseStoredDate)(state.startTime)?.getTime() ?? Date.now())) / 1000)
                : state.elapsedSec,
            sessionElapsedSec: state.sessionElapsedSec,
            remainingSec: state.status === 'running' && state.startTime && state.remainingSec !== null
                ? Math.max(0, state.remainingSec - Math.floor((Date.now() - ((0, utils_1.parseStoredDate)(state.startTime)?.getTime() ?? Date.now())) / 1000))
                : state.remainingSec,
            targetSec: state.targetSec,
            pomodoroPhase: state.pomodoroPhase,
            pomodoroRound: state.pomodoroRound,
            taskName: state.currentTask ? (0, utils_1.taskPath)(state.currentTask) : null,
            taskId: state.currentTask?.id ?? null,
            startTime: state.startTime,
        };
    }
    finalize(state, now, memo = '') {
        const start = (0, utils_1.parseStoredDate)(state.startTime) ?? now;
        const elapsed = state.mode === 'stopwatch'
            ? state.status === 'running'
                ? state.elapsedSec + Math.floor((now.getTime() - start.getTime()) / 1000)
                : state.elapsedSec
            : state.sessionElapsedSec +
                (state.status === 'running'
                    ? state.elapsedSec + Math.floor((now.getTime() - start.getTime()) / 1000)
                    : state.elapsedSec);
        const end = new Date(start.getTime() + elapsed * 1000);
        return createLog(start, end, state.currentTask, memo);
    }
}
exports.TimerApplicationService = TimerApplicationService;
class TaskMasterApplicationService {
    constructor(taskRepo, timerRepo) {
        this.taskRepo = taskRepo;
        this.timerRepo = timerRepo;
    }
    async create(input, now) {
        const task = { ...input, id: (0, utils_1.makeId)('task'), createdAt: (0, utils_1.nowIso)(now), updatedAt: (0, utils_1.nowIso)(now) };
        await this.taskRepo.save(task);
        return task;
    }
    async update(task, input, now) {
        const updated = { ...task, ...input, updatedAt: (0, utils_1.nowIso)(now) };
        await this.taskRepo.save(updated);
        return updated;
    }
    async delete(taskId) {
        const timer = await this.timerRepo.get();
        if (timer.currentTask?.id === taskId)
            throw new Error('Running task cannot be deleted');
        await this.taskRepo.delete(taskId);
    }
}
exports.TaskMasterApplicationService = TaskMasterApplicationService;
class LogEditApplicationService {
    constructor(logRepo) {
        this.logRepo = logRepo;
    }
    async create(input, now) {
        await this.logRepo.save(createLog(now, new Date(now.getTime() + Math.max(0, input.durationSec) * 1000), input.task, input.memo));
    }
    async updateDuration(logId, durationSec, now) {
        const log = await this.logRepo.findById(logId);
        if (!log)
            throw new Error('Log not found');
        const start = (0, utils_1.parseStoredDate)(log.startTime);
        if (!start)
            throw new Error('Invalid log start time');
        const updated = { ...log, durationSec, endTime: (0, utils_1.nowIso)(new Date(start.getTime() + durationSec * 1000)), updatedAt: (0, utils_1.nowIso)(now) };
        await this.logRepo.update(updated);
    }
    async updateTask(logId, task, now) {
        const log = await this.logRepo.findById(logId);
        if (!log)
            throw new Error('Log not found');
        await this.logRepo.update({ ...log, task, updatedAt: (0, utils_1.nowIso)(now) });
    }
    async updateMemo(logId, memo, now) {
        const log = await this.logRepo.findById(logId);
        if (!log)
            throw new Error('Log not found');
        await this.logRepo.update({ ...log, memo, updatedAt: (0, utils_1.nowIso)(now) });
    }
    async delete(logId) {
        const log = await this.logRepo.findById(logId);
        if (!log)
            throw new Error('Log not found');
        await this.logRepo.delete(logId);
    }
}
exports.LogEditApplicationService = LogEditApplicationService;
class LogQueryApplicationService {
    constructor(logRepo) {
        this.logRepo = logRepo;
    }
    async getAllLogs() {
        return this.logRepo.findAll();
    }
    async getLogsByRangeType(settings, referenceDate = new Date()) {
        const range = (0, export_1.resolveExportRange)(settings, referenceDate);
        const logs = (0, export_1.filterLogsByRange)(await this.logRepo.findAll(), range);
        return logs
            .sort((a, b) => ((0, utils_1.parseStoredDate)(b.startTime)?.getTime() ?? 0) - ((0, utils_1.parseStoredDate)(a.startTime)?.getTime() ?? 0))
            .map((log) => ({
            id: log.id,
            date: ((0, utils_1.parseStoredDate)(log.startTime) ?? new Date()).toLocaleDateString(),
            durationText: (0, utils_1.formatDuration)(log.durationSec),
            taskPath: (0, utils_1.taskPath)(log.task),
            memo: log.memo,
        }));
    }
    async getLogsByPeriod(period, referenceDate, weekStartDay) {
        const logs = await this.logRepo.findAll();
        const filtered = logs.filter((log) => {
            const startedAt = (0, utils_1.parseStoredDate)(log.startTime);
            return startedAt ? this.matchesPeriod(startedAt, period, referenceDate, weekStartDay) : false;
        });
        return filtered
            .sort((a, b) => ((0, utils_1.parseStoredDate)(b.startTime)?.getTime() ?? 0) - ((0, utils_1.parseStoredDate)(a.startTime)?.getTime() ?? 0))
            .map((log) => ({
            id: log.id,
            date: ((0, utils_1.parseStoredDate)(log.startTime) ?? new Date()).toLocaleDateString(),
            durationText: (0, utils_1.formatDuration)(log.durationSec),
            taskPath: (0, utils_1.taskPath)(log.task),
            memo: log.memo,
        }));
    }
    async getAggregatedLogs(period, referenceDate, weekStartDay) {
        const logs = await this.logRepo.findAll();
        const filtered = logs.filter((log) => {
            const startedAt = (0, utils_1.parseStoredDate)(log.startTime);
            return startedAt ? this.matchesPeriod(startedAt, period, referenceDate, weekStartDay) : false;
        });
        const groups = new Map();
        for (const log of filtered) {
            const key = period === 'day' ? ((0, utils_1.parseStoredDate)(log.startTime) ?? new Date()).toLocaleDateString() : period;
            const group = groups.get(key) ?? { key, totalDurationSec: 0, tasks: [] };
            group.totalDurationSec += log.durationSec;
            group.tasks.push({ taskPath: (0, utils_1.taskPath)(log.task), durationSec: log.durationSec });
            groups.set(key, group);
        }
        return [...groups.values()];
    }
    matchesPeriod(date, period, referenceDate, weekStartDay) {
        if (period === 'day')
            return (0, utils_1.formatDateKey)(date) === (0, utils_1.formatDateKey)(referenceDate);
        if (period === 'month')
            return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
        if (period === 'year')
            return date.getFullYear() === referenceDate.getFullYear();
        const ref = new Date(referenceDate);
        const diff = (ref.getDay() - weekStartDay + 7) % 7;
        const start = new Date(ref);
        start.setDate(ref.getDate() - diff);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return date >= start && date < end;
    }
}
exports.LogQueryApplicationService = LogQueryApplicationService;
class ExportApplicationService {
    constructor(logRepo, vault, settings, app) {
        this.logRepo = logRepo;
        this.vault = vault;
        this.settings = settings;
        this.app = app;
    }
    async exportCurrentSelection(referenceDate = new Date()) {
        const range = (0, export_1.resolveExportRange)(this.settings, referenceDate);
        const logs = (0, export_1.filterLogsByRange)(await this.logRepo.findAll(), range);
        const markdown = (0, export_1.buildExportContent)(this.settings, logs, range);
        const target = await this.writeExportFile(markdown, range.from, this.settings.appendToDailyNote);
        new obsidian_1.Notice(this.getExportNoticeLabel(target, range.label));
    }
    async exportWithRangeType(rangeType, referenceDate = new Date()) {
        const exportSettings = (0, export_1.cloneExportSettings)(this.settings, rangeType);
        const range = (0, export_1.resolveExportRange)(exportSettings, referenceDate);
        const logs = (0, export_1.filterLogsByRange)(await this.logRepo.findAll(), range);
        const markdown = (0, export_1.buildExportContent)(exportSettings, logs, range);
        const target = await this.writeExportFile(markdown, range.from, exportSettings.appendToDailyNote);
        new obsidian_1.Notice(this.getExportNoticeLabel(target, range.label));
    }
    async exportPeriod(period, referenceDate) {
        const logs = await this.logRepo.findAll();
        const filtered = logs.filter((log) => {
            const startedAt = (0, utils_1.parseStoredDate)(log.startTime);
            return startedAt ? this.matchesPeriod(startedAt, period, referenceDate) : false;
        });
        const range = { from: referenceDate, to: referenceDate, label: period };
        const markdown = (0, export_1.buildExportContent)(this.settings, filtered, range);
        const target = await this.writeExportFile(markdown, referenceDate, false);
        new obsidian_1.Notice(this.getExportNoticeLabel(target, `${period}`));
    }
    async labelExportPeriod(referenceDate = new Date()) {
        const range = (0, export_1.resolveExportRange)(this.settings, referenceDate);
        const label = `${range.label} (${referenceDate.toLocaleDateString()})`;
        const file = this.resolveOutputFile();
        const existing = await this.vault.adapter.read(file).catch(() => '');
        const separator = existing && !existing.endsWith('\n') ? '\n' : '';
        const header = `\n\n## Export period\n${label}\n`;
        await this.writeRaw(file, `${existing}${separator}${header}`);
        new obsidian_1.Notice(`Export period labeled: ${label}`);
    }
    async showSummaryTaskNames(referenceDate = new Date()) {
        const logs = await this.getLogsForSelection(referenceDate);
        new obsidian_1.Notice((0, export_1.getSummaryTaskNames)(logs));
    }
    async showSummaryTotalDuration(referenceDate = new Date()) {
        const logs = await this.getLogsForSelection(referenceDate);
        new obsidian_1.Notice((0, export_1.getSummaryTotalDuration)(logs));
    }
    async showSummaryTaskCount(referenceDate = new Date()) {
        const logs = await this.getLogsForSelection(referenceDate);
        new obsidian_1.Notice((0, export_1.getSummaryTaskCount)(logs));
    }
    async getLogsForSelection(referenceDate) {
        const range = (0, export_1.resolveExportRange)(this.settings, referenceDate);
        return (0, export_1.filterLogsByRange)(await this.logRepo.findAll(), range);
    }
    async writeExportFile(content, referenceDate, appendToDailyNote) {
        try {
            if (appendToDailyNote) {
                const file = await this.openStandardDailyNote(referenceDate);
                if (!file) {
                    new obsidian_1.Notice('Could not create daily note.');
                    return '';
                }
                await this.appendToFile(file, content);
                return file.path;
            }
            const file = this.resolveOutputFile();
            await this.writeRaw(file, content);
            return file;
        }
        catch (error) {
            new obsidian_1.Notice(error instanceof Error ? error.message : 'Export failed');
            return '';
        }
    }
    getExportNoticeLabel(target, fallbackLabel) {
        const fileName = target ? target.split('/').pop() ?? fallbackLabel : fallbackLabel;
        return `Log exported: ${fileName}`;
    }
    resolveOutputFile() {
        return this.normalizePath(this.settings.exportFilePath);
    }
    async writeRaw(file, content) {
        const parts = file.split('/');
        if (parts.length > 1) {
            await this.ensureDirectory(parts.slice(0, -1).join('/'));
        }
        const existing = await this.vault.adapter.read(file).catch(() => '');
        const separator = existing && !existing.endsWith('\n') ? '\n' : '';
        await this.vault.adapter.write(file, `${existing}${separator}${content}\n`);
    }
    async appendToFile(file, content) {
        const existing = await this.vault.read(file);
        const separator = existing && !existing.endsWith('\n') ? '\n' : '';
        await this.vault.modify(file, `${existing}${separator}${content}\n`);
    }
    async ensureDirectory(path) {
        const normalized = this.normalizePath(path);
        const segments = normalized.split('/').filter(Boolean);
        let current = '';
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            if (!(await this.vault.adapter.exists(current))) {
                await this.vault.adapter.mkdir(current);
            }
        }
    }
    normalizePath(path) {
        return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
    }
    async openStandardDailyNote(referenceDate) {
        const settings = this.getDailyNoteSettings();
        const filename = (0, obsidian_1.moment)(referenceDate).format(settings.format);
        const path = await this.getDailyNotePath(settings.folder, filename);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof obsidian_1.TFile) {
            return existing;
        }
        const templateContents = await this.getDailyNoteTemplateContents(settings.template);
        const createdFile = await this.app.vault.create(path, this.applyDailyNoteTemplate(templateContents, referenceDate, settings.format, filename));
        return createdFile instanceof obsidian_1.TFile ? createdFile : null;
    }
    getDailyNoteSettings() {
        const app = this.app;
        const dailyNotes = app.internalPlugins?.plugins?.['daily-notes']?.instance?.options;
        return {
            folder: dailyNotes?.folder?.trim() || '',
            format: dailyNotes?.format || 'YYYY-MM-DD',
            template: dailyNotes?.template?.trim() || '',
        };
    }
    async getDailyNotePath(folder, filename) {
        const path = filename.endsWith('.md') ? filename : `${filename}.md`;
        const normalized = (0, obsidian_1.normalizePath)(folder ? `${folder}/${path}` : path);
        const parts = normalized.replace(/\\/g, '/').split('/');
        if (parts.length > 1) {
            const dir = parts.slice(0, -1).join('/');
            if (dir && !(await this.vault.adapter.exists(dir))) {
                await this.vault.adapter.mkdir(dir);
            }
        }
        return normalized;
    }
    async getDailyNoteTemplateContents(template) {
        if (!template) {
            return '';
        }
        const templatePath = (0, obsidian_1.normalizePath)(template);
        if (templatePath === '/') {
            return '';
        }
        const templateFile = this.app.metadataCache.getFirstLinkpathDest(templatePath, '');
        if (!(templateFile instanceof obsidian_1.TFile)) {
            return '';
        }
        return await this.vault.cachedRead(templateFile).catch(() => '');
    }
    applyDailyNoteTemplate(template, referenceDate, format, filename) {
        return template
            .replace(/{{\s*date\s*}}/gi, filename)
            .replace(/{{\s*time\s*}}/gi, (0, obsidian_1.moment)().format('HH:mm'))
            .replace(/{{\s*title\s*}}/gi, filename)
            .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_match, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
            const now = (0, obsidian_1.moment)();
            const currentDate = (0, obsidian_1.moment)(referenceDate).set({
                hour: now.hour(),
                minute: now.minute(),
                second: now.second(),
            });
            if (calc) {
                currentDate.add(parseInt(timeDelta, 10), unit);
            }
            if (momentFormat) {
                return currentDate.format(momentFormat.substring(1).trim());
            }
            return currentDate.format(format);
        })
            .replace(/{{\s*yesterday\s*}}/gi, (0, obsidian_1.moment)(referenceDate).subtract(1, 'day').format(format))
            .replace(/{{\s*tomorrow\s*}}/gi, (0, obsidian_1.moment)(referenceDate).add(1, 'day').format(format));
    }
    matchesPeriod(date, period, referenceDate) {
        if (period === 'day')
            return date.toDateString() === referenceDate.toDateString();
        if (period === 'month')
            return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
        if (period === 'year')
            return date.getFullYear() === referenceDate.getFullYear();
        return true;
    }
}
exports.ExportApplicationService = ExportApplicationService;
