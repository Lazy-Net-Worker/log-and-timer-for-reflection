"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginTimerRepository = exports.PluginTaskRepository = exports.PluginLogRepository = exports.PluginDataRepository = void 0;
exports.createEmptyPluginData = createEmptyPluginData;
const utils_1 = require("./utils");
function createEmptyTimer() {
    return {
        status: 'idle',
        mode: 'stopwatch',
        startTime: null,
        elapsedSec: 0,
        sessionElapsedSec: 0,
        targetSec: null,
        remainingSec: null,
        pomodoroPhase: null,
        pomodoroRound: 0,
        currentTask: null,
        updatedAt: (0, utils_1.nowIso)(),
    };
}
function createEmptyPluginData() {
    return {
        logs: [],
        tasks: [],
        timer: createEmptyTimer(),
        settings: {
            weekStartDay: 1,
            exportFilePath: 'work-log.md',
            exportRangeType: 'today',
            exportRangeFrom: '',
            exportRangeTo: '',
            exportRangeOffset: 0,
            exportRangeLength: 1,
            exportRangeUnit: 'day',
            exportIncludeSummary: true,
            exportIncludeLogs: true,
            exportSummaryTemplate: '## Summary\n{{SUMMARY}}',
            exportLogItemTemplate: '- {{START}} - {{END}} | {{TASK}} | {{DURATION}} | {{MEMO}}',
            exportBodyTemplate: '{{SUMMARY}}\n\n{{LOGS}}',
            showReflectionInputOnSave: true,
            appendToDailyNote: false,
            inversePomodoroBreakRatio: 0.2,
            pomodoroWorkMinutes: 25,
            pomodoroBreakMinutes: 5,
            pomodoroRounds: 4,
            pomodoroInfinite: false,
        },
    };
}
class PluginDataRepository {
    constructor(plugin) {
        this.plugin = plugin;
        this.cachedData = null;
    }
    async getAll() {
        if (this.cachedData) {
            return this.cachedData;
        }
        const data = (await this.plugin.loadData());
        this.cachedData = {
            ...createEmptyPluginData(),
            ...(data ?? {}),
            settings: {
                ...createEmptyPluginData().settings,
                ...(data?.settings ?? {}),
            },
            timer: {
                ...createEmptyPluginData().timer,
                ...(data?.timer ?? {}),
            },
            logs: data?.logs ?? [],
            tasks: data?.tasks ?? [],
        };
        return this.cachedData;
    }
    async save(data) {
        this.cachedData = data;
        const backup = { ...data };
        delete backup.backup;
        await this.plugin.saveData({ ...data, backup });
    }
    getCached() {
        if (!this.cachedData) {
            throw new Error('Cache not initialized. Call getAll() first.');
        }
        return this.cachedData;
    }
}
exports.PluginDataRepository = PluginDataRepository;
class PluginLogRepository {
    constructor(repo) {
        this.repo = repo;
    }
    async findAll() {
        const data = await this.repo.getAll();
        return data.logs;
    }
    async findById(id) {
        const data = await this.repo.getAll();
        return data.logs.find((log) => log.id === id) ?? null;
    }
    async save(log) {
        await this.repo.save({
            ...(await this.repo.getAll()),
            logs: [...(await this.findAll()).filter((item) => item.id !== log.id), log],
        });
    }
    async update(log) {
        await this.save(log);
    }
    async delete(id) {
        const data = await this.repo.getAll();
        await this.repo.save({ ...data, logs: data.logs.filter((log) => log.id !== id) });
    }
}
exports.PluginLogRepository = PluginLogRepository;
class PluginTaskRepository {
    constructor(repo) {
        this.repo = repo;
    }
    async findAll() {
        return (await this.repo.getAll()).tasks;
    }
    async findById(id) {
        const data = await this.repo.getAll();
        return data.tasks.find((task) => task.id === id) ?? null;
    }
    async save(task) {
        const data = await this.repo.getAll();
        const tasks = [...data.tasks.filter((item) => item.id !== task.id), task];
        await this.repo.save({ ...data, tasks });
    }
    async delete(id) {
        const data = await this.repo.getAll();
        await this.repo.save({ ...data, tasks: data.tasks.filter((task) => task.id !== id) });
    }
}
exports.PluginTaskRepository = PluginTaskRepository;
class PluginTimerRepository {
    constructor(repo) {
        this.repo = repo;
    }
    async get() {
        return (await this.repo.getAll()).timer;
    }
    async save(state) {
        const data = await this.repo.getAll();
        await this.repo.save({ ...data, timer: state });
    }
}
exports.PluginTimerRepository = PluginTimerRepository;
