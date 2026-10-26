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
import { addScratch, nodeHasKind, edgeHasLabel, nodeHasLabel } from '../utilities/utils.js';
import { ExtractInterfaceStrategy } from '../refactoring/extractInterfaceStrategy.ts';
import { DependencyInjectionStrategy } from '../refactoring/dependencyInjectionStrategy.ts'
import { relayout } from '../uiControls/graphPanel.js';
import { applyRefactoringChangeSet, showNeighborhood } from '../graphProcessing/visualTransformations.js'
import { RefactorEngine } from '../refactoring/refactorEngine.ts';
import { ExpansionLayout } from './expansionLayout.ts'
import { UIBuilder } from './uiBuilder.ts'

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
    const expansionLayouter = new ExpansionLayout()
    const uiBuilder = new UIBuilder("#sidebar-content");
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
    
    const inspectCD = (ctx, idx) => {
        if (ctx.state.inspect && ctx.state.inspect.index === idx) {
            return
        }
        const scc = ctx.state.stronglyConnectedComponents[idx]
        
        const nodes = [...scc];
        scc.forEach((id) => {
            ctx.state.cy.getElementById(id).children().forEach((child) => {
                nodes.push(child.id())
            })
        })

        expansionLayouter.layoutExpandClasses2(ctx.state, scc)

        ctx.state.inspect = {
            index: idx,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: nodes
        }
        
        stageRunRefactoringPipeline(ctx)

        // Add scope UI and execute scope filters
        // const toggleNodes = (expand) => {
        //     console.log(expand)
        //     if (expand) {
        //         expansionLayouter.layoutExpandClasses2(ctx.state, scc)
        //     } else {
        //         expansionLayouter.reset(ctx.state)
        //     }
        // }
        actions.fillInspectionControls(ctx.state.cy, "#tab-baseline")
        // actions.toggleNodes
        actions.setEdgeVisibilityPresetMethodLevel(ctx.state.cy)

        // Zoom in to SCC
        ctx.state.cy.animate({
            zoom: 0.5,
            center: {
                eles: ctx.state.cy.getElementById(scc[0])
            }
        });
    }
    
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
        
        ui.listCyclicDependencies(SSCs.map(scc => scc.map(index => nodeMapping[index])), (idx) => inspectCD(ctx, idx));
        
        // Convert back to original node ids
        ctx.state.stronglyConnectedComponents = SSCs.map(scc => scc.map(index => nodeMapping[index]));
        // uiBuilder.buildCyclicDependenciesList(ctx.state)
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
        // uiBuilder.buildRefactoringList(state, ctx)
	});

     const previewRefactoring = async (ctx, refactoring) => {
        const statePreview = createAppState()
        
        // Copy original graph including the hidden edges
        const elements = {
            nodes: ctx.state.cy.nodes().jsons(),
            edges: [
                ...ctx.state.cy.edges().jsons(),
                ...Object.values(ctx.state.hiddenEdges ?? {})
                .filter(Boolean)
                .flatMap(edges => edges.jsons())
            ]
        };
        const numEdges = ctx.state.hcy.edges().length;
        const cynew = await ctx.cyAdapter.createVisual(ctx.ui.$('#cypreview'), elements, ctx.style, numEdges > 5000);
        
        let strategy;
        switch( refactoring.kind) {
            case "extract-interface":
                strategy = new ExtractInterfaceStrategy();
                break;
                case "dependency-injection":
                strategy = new DependencyInjectionStrategy();
                break;
            default:
                throw Error("No strategy found")
            }
        
        const changeSet = strategy.apply(ctx.state.hcy, refactoring);
        statePreview.cy = cynew;
        // statePreview.hcy = ctx.cyAdapter.createHeadless(cynew.json().elements.clone());
        statePreview.hcy = ctx.state.hcy
        applyRefactoringChangeSet(statePreview, changeSet, ctx.state)
        const visualPipeline = createVisualPipeline({ state: statePreview });
        ctx.cyAdapter.batch(cynew, () => {
            visualPipeline({ cy: cynew });
        });

        const scc = ctx.state.stronglyConnectedComponents[ctx.state.inspect.index]
        const nodes = cynew.nodes().filter((n) => n.data("labels").includes("Modified") || n.data("labels").includes("New") || scc.includes(n.id())).map((n) => n.id())
        
        // shallow clone, error prone
        statePreview.inspect = {
            index: 0,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: nodes,
            expandNodes: Object.keys(statePreview.hiddenNodes['variables']).concat(Object.keys(statePreview.hiddenNodes['methods']))
        }
        console.log("keysss", statePreview.inspect.expandNodes)
        
        const actionsPreview = createActions({state:statePreview, ui})
        actionsPreview.initializePostRender(cynew, "#tab-preview");

        cynew.once('layoutstop', () => {
            const node = cynew.getElementById(changeSet.focus);

            cynew.animate({
                zoom: 0.8,
                center: {
                    eles: node
                }
            });
        });
    }

	const stageRunPostRender = tap((ctx) => {
        uiBuilder.buildNormalEdgeControls(ctx.state)
		ctx.actions.initializePostRender(state.cy, '#tab-baseline');
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
