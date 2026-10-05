import { clearInfo } from '../uiControls/infoPanel.js';
import { GraphService } from '../smell-detection/graphService.ts';
import { GraphPreprocessor } from '../graphPreProcessing/graphPreprocessor.ts';
import { augmentGraphWithDimensionMetadata, isColoringContractCompliant } from '../graphProcessing/dimensionMetadata.js';
import { createActions } from './actions.js';
import { createCyAdapter } from './cyAdapter.js';
import { createHeadlessPipeline, createVisualPipeline, createRefactoringPipeline } from './graphPipeline.js';
import { createAppState, installWindowStateShim } from './state.js';
import { createUiAdapter } from './uiAdapter.js';
import { tap } from '../composing.js';
import { DEFAULT_COLOR_MAP, DEFAULT_COLOR_ORDER } from './constants.js';

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
	const headlessPipeline = createHeadlessPipeline({ state });
	const visualPipeline = createVisualPipeline({ state });
    const refactoringPipeline = createRefactoringPipeline({ state });
	installWindowStateShim(state);
    Split(['#cy', '#cypreview'])

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
	});

	const stagePrepareGraph = tap((ctx) => {
        ctx.graph = graphPreprocessor.prepareGraph(ctx.rawGraph, ctx.sourceName);
		ctx.state.coloringMeta = ctx.graph.coloringMeta || { nodes: [], edges: [] };
	});

    const stageDetectCyclicDependencies = tap((ctx) => {
        // Convert labeled nodes and edges into sequential indices for SCC detection
        let nodeMapping = {};
        let k = 1;
        for (let node of ctx.graph.abstract.elements.nodes) {
            if (!node.data.labels.includes('Type')) continue;
            nodeMapping[k] = node.data.id;
            nodeMapping[node.data.id] = k;
            k += 1;
        }
        
        const problematic_interactions = ['calls', 'holds', 'accepts'];
        let edges = ctx.graph.abstract.elements.edges.filter(edge => problematic_interactions.includes(edge.data.label) && nodeMapping.hasOwnProperty(edge.data.source) && nodeMapping.hasOwnProperty(edge.data.target)).map(edge => [nodeMapping[edge.data.source], nodeMapping[edge.data.target]]);
        const SSCs = GraphService.getStronglyConnectedComponents(ctx.graph.abstract.elements.nodes.length, edges);
        ui.listCyclicDependencies(SSCs.map(scc => scc.map(index => nodeMapping[index])));
        
        // Convert back to original node ids
        ctx.state.stronglyConnectedComponents = SSCs.map(scc => scc.map(index => nodeMapping[index]));
	});

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
		ctx.state.cy = await ctx.cyAdapter.createVisual(ctx.ui.$('#cy'), ctx.state.hcy.json().elements, ctx.style, numEdges > 5000);
		return ctx;
	};

	const stageRunVisualPipeline = tap((ctx) => {
		ctx.cyAdapter.batch(ctx.state.cy, () => {
			visualPipeline({ cy: ctx.state.cy });
		});
	});

    const stageCreateRefactoringPipeline = async (ctx) => {
		ctx.state.refactoringPipeline = await ctx.cyAdapter.createHeadless(ctx.graph.abstract.elements);
		return ctx;
	};

    const stageRunRefactoringPipeline = tap((ctx) => {
		ctx.cyAdapter.batch(ctx.state.refactoringPipeline, () => {
			refactoringPipeline({ cy: ctx.state.hcy });
		});
        ui.listRefactorings(state.refactorings, (refactoring) => previewRefactoring(ctx, refactoring));
	});

    const previewRefactoring = async (ctx, refactoring) => {
        console.log("preview loading..", refactoring)
        const numEdges = ctx.state.hcy.edges().length;
        const cynew = await ctx.cyAdapter.createVisual(ctx.ui.$('#cypreview'), ctx.state.cy.json().elements, ctx.style, numEdges > 5000);
        
        const nodeToRefactor = cynew.getElementById(refactoring.class)
        const interfaceName = "I" + nodeToRefactor.data("label")
        const nodes = cynew.add([
            {
                group: 'nodes',
                data: { id: interfaceName, label: interfaceName,  name: interfaceName, labels: ["Type"], name: interfaceName, properties: { "type": "interface", "kind": "class", "simpleName": "Int" } },
            }, 
            {
                group: 'edges',
                data: { source: nodeToRefactor.id(), target: interfaceName, label: 'myInterface' },
            }
        ]);

        cynew.getElementById(interfaceName).move({ parent: nodeToRefactor.parent().id() });

        nodes.forEach((ele) => {
		if (ele.data('label')) {
			ele.addClass(ele.data('label'))
		}
		if (ele.data('labels')) {
			ele.data('labels').forEach(label => ele.addClass(label));
		}
        });

        // ctx.cyAdapter.batch(cynew, () => {
		// 	headlessPipeline({ cy: cynew });
		// });
        ctx.cyAdapter.batch(cynew, () => {
			visualPipeline({ cy: cynew });
		});
        ctx.actions.initializePostRender(cynew, "#reltab2");
    }

	const stageRunPostRender = tap((ctx) => {
		ctx.actions.initializePostRender(state.cy, '#reltab');
	});

	const initializeGraph = pipeAsync(
		stageResetRuntimeState,
		stagePrepareGraph,
        stageDetectCyclicDependencies,
		stageCreateHeadlessCy,
		stageRunHeadlessPipeline,
		stageCreateVisualCy,
		stageRunVisualPipeline,
        stageCreateRefactoringPipeline,
        stageRunRefactoringPipeline,
		stageRunPostRender
	);

	const bindStaticControls = () => {
		ui.on('click', ui.$('#btn-upload'), fileUpload);
		ui.on('click', ui.$('#btn-download'), () => actions.saveAsSvg('class-diagram.svg'));
		ui.on('click', ui.$('#btn-popup'), () => window.open(actions.getSvgUrl(), '_blank'));
		ui.on('click', ui.$('#btn-toggleVisibility'), actions.toggleVisibility);
		ui.on('click', ui.$('#btn-hideClasses'), () => actions.setClassVisibilityTap('cxttap'));
		ui.on('click', ui.$('#btn-showClasses'), () => actions.setClassVisibilityTap('tap'));
	};

	const initFromPayload = async ({ rawGraph, style, sourceName }) => {
		await initializeGraph({ rawGraph, style, sourceName, state, ui, cyAdapter, actions });
        // await initializeGraph({ rawGraph, style, sourceName, state, ui, cyAdapter, actions });
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
		ui.bindTabs();

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
