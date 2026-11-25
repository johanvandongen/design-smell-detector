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
import { addScratch, nodeHasKind, edgeHasLabel, nodeHasLabel } from '../utilities/utils.js';
import { ExtractInterfaceStrategy } from '../refactoring/extractInterfaceStrategy.ts';
import { DependencyInjectionStrategy } from '../refactoring/dependencyInjectionStrategy.ts'
import { MoveMethodStrategy } from '../refactoring/moveMethodStrategy.ts'
import { relayout } from '../uiControls/graphPanel.js';
import { applyRefactoringChangeSet, showNeighborhood } from '../graphProcessing/visualTransformations.js'
import { RefactorEngine } from '../refactoring/refactorEngine.ts';
import { CDAnalyser } from '../app/cdAnalyser.ts'
import { CycleAnalyser } from './cycleAnalyser.ts'
import { RefactoringAnalyser } from './RefactoringAnalyser.ts'
import { RefactorRanker } from './RefactorRanker.ts'
import { deriveRelationshipLabels } from './pure.js';

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
        const inspect = inspectNodes(scc, ctx.state.cy)

        ctx.state.inspect = {
            index: idx,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: inspect.nodes
        }
        
        stagelistRefactorings(ctx)
        actions.fillInspectionControls(ctx.state.cy, "#tab-baseline")
        actions.setEdgeVisibilityPreset("#tab-baseline", ctx.state.cy, "class")
        const cycleAnalyser = new CycleAnalyser()
        
        const description = cycleAnalyser.getInspectDescription(ctx.state.cy, scc)
        ui.renderCycleDescription(description);
        ctx.state.cy.animate({fit: {eles: inspect.fitElements}})
    }

    const stageDetectCyclicDependencies = tap((ctx) => {
        const SCCs = GraphService.getStronglyConnectedComponents(ctx.state.hcy)
        ui.listCyclicDependencies(SCCs, (idx) => inspectCD(ctx, idx));
        ctx.state.stronglyConnectedComponents = SCCs;
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

    const searchRefactoringOpportunities = (state) => {
        if (state.stronglyConnectedComponents.length === 0 || state.inspect === null) {
            return null;
        }
        const scc = state.stronglyConnectedComponents[state.inspect.index];
        const refactorEngine = new RefactorEngine(state.hcy);
        return refactorEngine.suggestRefactoringsForSCC(scc);
    }

    const stagelistRefactorings = tap((ctx) => {
        state.refactorings = searchRefactoringOpportunities(ctx.state)
        if (state.refactorings === null) {
            ui.listRefactorings(null, {});  
            return;
        }

        const handlers = {
            preview: (refactoring) => previewRefactoring(ctx, refactoring),
            accept: (refactoring) => acceptRefactoring(ctx, refactoring)
        }

        rankRefactorings(ctx, state.refactorings).then((result) =>{
            ui.listRefactorings(result, handlers, state.inspect.index);    
        })
        ui.listRefactorings(state.refactorings, handlers, state.inspect.index);
	});

    const rankRefactorings = async (ctx, refactorings) => {
        if (ctx.state.inspect === null) {
            throw Error("Inspect was empty, please select a cycle")
        }
        const rankedRefactorings = []
        for (const refactoring of refactorings) {
            const scc = ctx.state.stronglyConnectedComponents[ctx.state.inspect.index]
            const sccNodeIds = inspectNodes(scc, ctx.state.cy).nodes
            const insideEdges = (edge) => sccNodeIds.includes(edge.data.source) && sccNodeIds.includes(edge.data.target);
            const boundaryEdges = (edge) => sccNodeIds.includes(edge.data.source) != sccNodeIds.includes(edge.data.target);


            const prev = ctx.state.hcy.edges().jsons()
            const news = prev.filter((edge) => edge.data.source !== undefined && edge.data.target !== undefined && (insideEdges(edge) || boundaryEdges(edge)))
            const elements = {
                nodes: ctx.state.hcy.nodes().jsons(),
                edges: news
            };
            const statePreview = createAppState()

            // console.log("edges length refac graph all vs scoped", prev.length, news.length, elements.nodes.length)
            const cynew = await ctx.cyAdapter.createHeadless(elements) //.createVisual(ctx.ui.$('#cy-preview'), elements, ctx.style, numEdges > 5000);
            const changeSet = getChangeSetForRefactoring(ctx.state.hcy, refactoring)
            statePreview.cy = cynew;
            statePreview.hcy = ctx.state.hcy
            applyRefactoringChangeSet(statePreview.cy, changeSet, ctx.state)

            const SCCs = GraphService.getStronglyConnectedComponents(cynew)
            const refactorRanker = new RefactorRanker()
            const score = refactorRanker.rank(ctx.state.hcy, cynew, scc, SCCs, refactoring, changeSet)
            rankedRefactorings.push({suggestion: refactoring, score: score})
            console.log(`Ranked ${refactoring.description} with score: ${score}`)
        }

        rankedRefactorings.sort((a, b) => b.score - a.score)
        return rankedRefactorings
    }

    /** remove old smell labels and add the new smell labels */
    const updateSmellLabels = (cynew, newSCCs) => {
        // Remove old SCC labels
        cynew.$(".CD-smell").forEach((ele) => {
            if (ele.data("labels")) {
                const newLabels = ele.data("labels").filter((l) => l !== "CD-smell")
                ele.data("labels", newLabels);
            }
        })
        
        // Add new SCC labels
        newSCCs.forEach((scc) => {
            scc.forEach((id) => {
                cynew.getElementById(id).data("labels").push("CD-smell")
            })
        })

        // Still keep reference to old SCC classes via new 'inspect' label
        // cynew.nodes().filter((n) => scc.includes(n.id())).forEach((ele) => {
        //     ele.data("labels").push("inspect")
        //     ele.addClass("inspect")
        // })
    }

     const previewRefactoring = async (ctx, refactoring) => {
        if (ctx.state.inspect === null) {
            throw Error("Inspect was empty, please select a cycle")
        }
        const statePreview = createAppState()
        
        // Copy original graph including the hidden edges
        const elements = {
            nodes: ctx.state.hcy.nodes().jsons(),
            edges: ctx.state.hcy.edges().jsons(),
        };
        const numEdges = ctx.state.hcy.edges().length;
        const cynew = await ctx.cyAdapter.createVisual(ctx.ui.$('#cy-preview'), elements, ctx.style, numEdges > 5000);
        const changeSet = getChangeSetForRefactoring(ctx.state.hcy, refactoring)
        statePreview.cy = cynew;
        statePreview.hcy = cynew;//ctx.state.hcy // TODO make hcy a clone of cynew o correct edgelabels can be derived in preview mode
        applyRefactoringChangeSet(statePreview.cy, changeSet, ctx.state)

        const scc = ctx.state.stronglyConnectedComponents[ctx.state.inspect.index]
        
        const SCCs = GraphService.getStronglyConnectedComponents(cynew) // should detect on unbundled edges (so before running visual pipeline like currently)
        updateSmellLabels(cynew, SCCs)
        const refactoringAnalyser = new RefactoringAnalyser(cynew, scc, SCCs)
        ctx.ui.renderRefactorDescription(refactoringAnalyser.analyseRefactoringResult(refactoring, changeSet))

        statePreview.stronglyConnectedComponents = SCCs;

        const visualPipeline = createVisualPipeline({ state: statePreview });
        ctx.cyAdapter.batch(cynew, () => {
            visualPipeline({ cy: cynew });
        });

        const inspect = inspectNodes([...scc, changeSet.focus], cynew)
        
        // shallow clone, error prone
        statePreview.inspect = {
            index: 0,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: inspect.nodes,
            expandNodes: Object.keys(statePreview.hiddenNodes['variables']).concat(Object.keys(statePreview.hiddenNodes['methods']))
        }
        
        const actionsPreview = createActions({state:statePreview, ui})
        actionsPreview.initializePostRender(cynew, "#tab-preview");
        actionsPreview.setEdgeVisibilityPreset("#tab-preview", statePreview.cy, "class")

        cynew.once('layoutstop', () => cynew.animate({fit: {eles: inspect.fitElements}}));
    }

    const getChangeSetForRefactoring = (graph, refactoring) => {
        let strategy;
        switch( refactoring.kind) {
            case "extract-interface":
                strategy = new ExtractInterfaceStrategy();
            break;
            case "dependency-injection":
                strategy = new DependencyInjectionStrategy();
            break;
            case "move-method":
                strategy = new MoveMethodStrategy();
            break;
            default:
                throw Error("No strategy found to apply refactoring of kind: " + refactoring.kind);
        }
                    
        const changeSet = strategy.apply(graph, refactoring);
        return changeSet
    }

    const acceptRefactoring = async (ctx, refactoring) => {
        const changeSet = getChangeSetForRefactoring(ctx.state.hcy, refactoring)
        applyRefactoringChangeSet(ctx.state.hcy, changeSet, ctx.state)
        
        // Either copy hcy into cy, or restore all edges (hidden and lifted) and apply changes to cy aswell (the latter is assumed to be more performative)
        ctx.state.inspect = null
        actions.restoreAllEdges("#tab-baseline")
        applyRefactoringChangeSet(ctx.state.cy, changeSet, ctx.state)
        
        stageDetectCyclicDependencies(ctx)

        // Try remove method nodes to improve visual look (declutter) but for some reason some nodes cannot be removed without removing connected edges first
        // Solved partially by removing (preventing) duplicate edges in applying changeset. HOWEVER, why does that change correspond with node.classes().includes(node.data("label")? that makes no sense what does the class have to do with duplicate edges
        // const removeIds = []
        // ctx.state.cy.nodes().filter((n) => nodeHasLabel(n, "Operation") && nodeHasLabel(n, "Modified")).forEach((ele) => {
        //     if (ele.data("labels")) {
        //         const newLabels = ele.data("labels").filter((l) => l !== "Modified")
        //         ele.data("labels", newLabels);
        //         ele.removeClass("Modified")
        //         removeIds.push(ele.id())
        //     }
        // })
        // for (const id of removeIds) {
        //     const node = ctx.state.cy.getElementById(id)
        //     if (id==="nl.tudelft.jpacman.npc.ghost.Inky.followPath(java.util.List,nl.tudelft.jpacman.board.Square)") {
        //         // node.classes().includes(node.data("label")) || 
        //         console.log("cannot remove: ", node)
        //         node.connectedEdges().forEach((edge) => console.log(edge.data()))
        //         // node.removeClass("Expanded")
        //         // node.connectedEdges().remove()
        //         node.remove()
        //         console.warn(`Could not remove node`, node.data())
        //         continue
        //     }
        //     node.remove()
        // }

        stageRunVisualPipeline(ctx)
        actions.setEdgeVisibilityPreset('#tab-baseline', ctx.state.cy, 'calls')
        ui.renderDescription(refactoring.description, '#cycle-description', 'Accepted refactoring')
        stagelistRefactorings(ctx)
        relayout(ctx.state.cy, ui.$('#selectlayout').options[ui.$('#selectlayout').selectedIndex].value);
        ctx.state.cy.once('layoutstop', () => ctx.state.cy.animate({fit: {eles: changeSet.focus}}));
    }

    const inspectNodes = (nodes, cy) => {
        const fitElements = cy.nodes().filter((n) => nodes.includes(n.id()))
        const nodesChildren = cy.nodes().filter((n) =>nodes.includes(n.parent().first().id())).map((n) => n.id());
        return { fitElements, nodes: [...nodes, ...nodesChildren]}
    }

	const stageRunPostRender = tap((ctx) => {
		ctx.actions.initializePostRender(state.cy, '#tab-baseline');
	});

	const initializeGraph = pipeAsync(
		stageResetRuntimeState,
		stagePrepareGraph,
		stageCreateHeadlessCy,
        stageDetectCyclicDependencies,
		stageRunHeadlessPipeline,
		stageCreateVisualCy,
		stageRunVisualPipeline,
        stagelistRefactorings,
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
