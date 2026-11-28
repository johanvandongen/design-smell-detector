import { clearInfo } from '../uiControls/infoPanel.js';
import { GraphService, GraphServiceNumeric } from '../smell-detection/graphService.ts';
import { GraphPreprocessor } from '../graphPreProcessing/graphPreprocessor.ts';
import { augmentGraphWithDimensionMetadata, isColoringContractCompliant } from '../graphProcessing/dimensionMetadata.js';
import { createActions } from './actions.js';
import { createCyAdapter } from './cyAdapter.js';
import { createHeadlessPipeline, createVisualPipeline, createRefactoringPipeline } from './graphPipeline.js';
import { createAppState, installWindowStateShim } from './state.js';
import { createUiAdapter } from './uiAdapter.js';
import { tap } from '../composing.js';
import { DEFAULT_COLOR_MAP, DEFAULT_COLOR_ORDER } from './constants.js';
import { SCCInspectionController } from './sccInspectionController.ts'

const pipeAsync = (...fns) => async (x) => {
	let value = x;
	for (const fn of fns) {
		value = await fn(value);
	}
	return value;
};

export function bootstrapApp() {
	const state = createAppState();
	const ui = createUiAdapter();
	const cyAdapter = createCyAdapter();
	const actions = createActions({ state, ui });
    const graphPreprocessor = new GraphPreprocessor();
    const sccController = new SCCInspectionController();
	const headlessPipeline = createHeadlessPipeline({ state });
	const visualPipeline = createVisualPipeline({ state });
	installWindowStateShim(state);
    Split(['#baseline', '#preview'])

	const stageResetRuntimeState = tap((ctx) => {
		ctx.state.hiddenEdges = {};
		ctx.state.flip = false;
		ctx.state.coloringMeta = { nodes: [], edges: [] };
		ctx.state.colorMap = { ...DEFAULT_COLOR_MAP };
		ctx.state.colorOrder = { ...DEFAULT_COLOR_ORDER };
		ctx.state.coloringModes = [{
			id: 'style_default',
			label: 'None',
			scratchKey: 'style_default',
			enabled: true,
		}];
        
        ctx.state.hiddenEdges = {};
        ctx.state.stronglyConnectedComponents = [];
        ctx.state.hiddenNodes = {};
        ctx.state.refactorings = [];
        ctx.state.inspect = null;
	});

	const stagePrepareGraph = tap((ctx) => {
        ctx.graph = graphPreprocessor.prepareGraph(ctx.rawGraph, ctx.sourceName);
		ctx.state.coloringMeta = ctx.graph.coloringMeta || { nodes: [], edges: [] };
	});

    const stageDetectSCC = tap((ctx) => {
        sccController.detectCyclicDependencies(ctx)
        sccController.listRefactorings(ctx)
    })

	const stageCreateHeadlessCy = async (ctx) => {
		ctx.state.hcy = await ctx.cyAdapter.createHeadless(ctx.graph.abstract.elements);
		return ctx;
	};

	const stageRunHeadlessPipeline = tap((ctx) => {
		ctx.cyAdapter.batch(ctx.state.hcy, () => {
			headlessPipeline({ cy: ctx.state.hcy });
		});
	});

	const stageCreateVisualCy = async (ctx) => {
		const numEdges = ctx.state.hcy.edges().length;
		ctx.state.cy = await ctx.cyAdapter.createVisual(ctx.ui.$('#cy-baseline'), ctx.state.hcy.json().elements, ctx.style, numEdges > 5000);
		return ctx;
	};

	const stageRunVisualPipeline = tap((ctx) => {
		ctx.cyAdapter.batch(ctx.state.cy, () => {
			visualPipeline({ cy: ctx.state.cy });
		});
        // deriveRelationshipLabels(state.hcy.json().elements).forEach((relation) => ctx.state.hiddenEdges[relation] = ctx.state.cy.edges(`[label = "${relation}"]`) )
	});

	const stageRunPostRender = tap((ctx) => {
		ctx.actions.initializePostRender(state.cy, '#tab-baseline');
	});

	const initializeGraph = pipeAsync(
		stageResetRuntimeState,
		stagePrepareGraph,
		stageCreateHeadlessCy,
        stageDetectSCC,
		stageRunHeadlessPipeline,
		stageCreateVisualCy,
		stageRunVisualPipeline,
		stageRunPostRender
	);

	const bindStaticControls = () => {
		ui.on('click', ui.$('#btn-upload'), fileUpload);
		ui.on('click', ui.$('#btn-download'), () => actions.saveAsSvg('class-diagram.svg'));
		ui.on('click', ui.$('#btn-popup'), () => window.open(actions.getSvgUrl(), '_blank'));
		ui.on('click', ui.$('#btn-toggleVisibility'), actions.toggleVisibility);
		ui.on('click', ui.$('#btn-hideClasses'), () => actions.setClassVisibilityTap('cxttap'));
		ui.on('click', ui.$('#btn-showClasses'), () => actions.setClassVisibilityTap('tap'));
        ui.on('click', ui.$('#tool-info-button'), () => ui.$('#tool-info-dialog').showModal())
        ui.on('click', ui.$('#tool-info-close'), () => ui.$('#tool-info-dialog').close())
        ui.on('click', ui.$('#tool-info-dialog'), (e) => {if (e.target === ui.$('#tool-info-dialog')) {ui.$('#tool-info-dialog').close()}})
        ui.on('change', ui.$('#select-sample-project'), (e) => {if (e.target.value !== "None") {initFromQueryParam(e.target.value)}})
	};

	const initFromPayload = async ({ rawGraph, style, sourceName }) => {
		await initializeGraph({ rawGraph, style, sourceName, state, ui, cyAdapter, actions });
	};

	const initFromQueryParam = async (fileName) => {
		const [rawGraph, style] = await Promise.all([
			fetch(`data/${fileName}.json`).then(ui.toJson),
			fetch('style.cycss').then(ui.toText),
		]);
		ui.setFilename(`Software Visualization: ${fileName}.json`);
		clearInfo('#infobody');
		await initFromPayload({ rawGraph, style, sourceName: `query param data/${fileName}.json` });
	};

	const initFromUpload = async (file) => {
        ui.$('#select-sample-project').value = "None"
		ui.setFilename(`Software Visualization – ${file.name}`);
		clearInfo('#infobody');
		const [rawText, style] = await Promise.all([
			file.text(),
			fetch('style.cycss').then(ui.toText),
		]);
		const parsedGraph = JSON.parse(rawText);
		const rawGraph = isColoringContractCompliant(parsedGraph)
			? parsedGraph
			: augmentGraphWithDimensionMetadata(parsedGraph);
		await initFromPayload({ rawGraph, style, sourceName: `upload ${file.name}` });
	};

	function fileUpload() {
		const fileSelector = ui.$('#file-selector');
		fileSelector.click();
		ui.on('change', fileSelector, async (event) => {
			const file = event.target.files?.[0];
			if (!file) return;
			try {
				await initFromUpload(file);
			} catch (error) {
				console.error('Error processing uploaded graph:', error);
			}
		});
	}

	ui.on('DOMContentLoaded', document, async () => {
        cytoscape.warnings(false);
		actions.bindWindowShortcuts();
		bindStaticControls();
		ui.bindTabs("#general-traces");
        ui.bindTabs("#baseline-preview");

		const fileName = new URLSearchParams(window.location.search).get('p');
		if (!fileName) return;
		try {
			await initFromQueryParam(fileName);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	});

	return { state, ui, actions };
}
