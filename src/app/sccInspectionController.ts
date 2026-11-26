//@ts-ignore
import { applyRefactoringChangeSet } from '../graphProcessing/visualTransformations.js'
import { GraphService, GraphServiceNumeric } from '../smell-detection/graphService';
//@ts-ignore
import { createActions } from './actions.js';
//@ts-ignore
import { createHeadlessPipeline, createVisualPipeline, createRefactoringPipeline, stageRunVisualPipeline } from './graphPipeline.js';
//@ts-ignore
import { createAppState } from './state.js';
import { ExtractInterfaceStrategy } from '../refactoring/extractInterfaceStrategy';
import { DependencyInjectionStrategy } from '../refactoring/dependencyInjectionStrategy'
import { MoveMethodStrategy } from '../refactoring/moveMethodStrategy'
//@ts-ignore
import { relayout } from '../uiControls/graphPanel.js';
//@ts-ignore
import { RefactorEngine, RefactorSuggestion } from '../refactoring/refactorEngine';
import { RefactoringAnalyser } from './RefactoringAnalyser'
import { RefactorRanker } from './RefactorRanker'
import cytoscape from 'cytoscape';
import { EdgeData } from '../graphPreProcessing/graphPreprocessor.js';
import { CycleAnalyser } from './cycleAnalyser.js';

interface Context {
    state: any;
    ui: any;
    actions: any;
    cyAdapter: any;
    style: any
}

/** 
 * Class responsible for managing smells (SCCs). It detects and lists smells and provides functionality for  
 * generating refactorings and previewing and accepting them.
 * */
export class SCCInspectionController {

    detectCyclicDependencies = (ctx: Context) => {
        const SCCs = GraphService.getStronglyConnectedComponents(ctx.state.hcy)
        ctx.ui.listCyclicDependencies(SCCs, (idx: number) => this.inspectCD(ctx, idx));
        ctx.state.stronglyConnectedComponents = SCCs;
    };

    inspectCD = (ctx: Context, idx: number) => {
        if (ctx.state.inspect && ctx.state.inspect.index === idx) {
            return
        }
        const scc = ctx.state.stronglyConnectedComponents[idx]
        const inspect = this.inspectNodes(scc, ctx.state.cy)

        ctx.state.inspect = {
            index: idx,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: inspect.nodes
        }
        
        this.listRefactorings(ctx)
        ctx.actions.fillInspectionControls(ctx.state.cy, "#tab-baseline")
        ctx.actions.setEdgeVisibilityPreset("#tab-baseline", ctx.state.cy, "class")
        const cycleAnalyser = new CycleAnalyser()
        
        const description = cycleAnalyser.getInspectDescription(ctx.state.cy, scc)
        ctx.ui.renderCycleDescription(description);
        ctx.state.cy.animate({fit: {eles: inspect.fitElements}})
    }

    rankRefactorings = async (ctx: Context, refactorings: RefactorSuggestion[]) => {
            if (ctx.state.inspect === null) {
                throw Error("Inspect was empty, please select a cycle")
            }
            const rankedRefactorings = []
            for (const refactoring of refactorings) {
                const scc = ctx.state.stronglyConnectedComponents[ctx.state.inspect.index]
                const sccNodeIds = this.inspectNodes(scc, ctx.state.cy).nodes
                const insideEdges = (edge: EdgeData) => sccNodeIds.includes(edge.data.source) && sccNodeIds.includes(edge.data.target);
                const boundaryEdges = (edge: EdgeData) => sccNodeIds.includes(edge.data.source) != sccNodeIds.includes(edge.data.target);
    
    
                const prev = ctx.state.hcy.edges().jsons()
                const news = prev.filter((edge: EdgeData) => edge.data.source !== undefined && edge.data.target !== undefined && (insideEdges(edge) || boundaryEdges(edge)))
                const elements = {
                    nodes: ctx.state.hcy.nodes().jsons(),
                    edges: news
                };
                const statePreview = createAppState()
    
                // console.log("edges length refac graph all vs scoped", prev.length, news.length, elements.nodes.length)
                const cynew = await ctx.cyAdapter.createHeadless(elements) //.createVisual(ctx.ui.$('#cy-preview'), elements, ctx.style, numEdges > 5000);
                const changeSet = this.getChangeSetForRefactoring(ctx.state.hcy, refactoring)
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

    searchRefactoringOpportunities = (state: any) => {
        if (state.stronglyConnectedComponents.length === 0 || state.inspect === null) {
            return null;
        }
        const scc = state.stronglyConnectedComponents[state.inspect.index];
        const refactorEngine = new RefactorEngine(state.hcy);
        return refactorEngine.suggestRefactoringsForSCC(scc);
    }

    listRefactorings = (ctx: Context) => {
        ctx.state.refactorings = this.searchRefactoringOpportunities(ctx.state)
        if (ctx.state.refactorings === null) {
            ctx.ui.listRefactorings(null, {});  
            return;
        }

        const handlers = {
            preview: (refactoring: RefactorSuggestion) => this.previewRefactoring(ctx, refactoring),
            accept: (refactoring: RefactorSuggestion) => this.acceptRefactoring(ctx, refactoring)
        }

        this.rankRefactorings(ctx, ctx.state.refactorings).then((result) =>{
            ctx.ui.listRefactorings(result, handlers, ctx.state.inspect.index);    
        })
        ctx.ui.listRefactorings(ctx.state.refactorings, handlers, ctx.state.inspect.index);
	};
    
    /** remove old smell labels and add the new smell labels */
    updateSmellLabels = (cynew: cytoscape.Core, newSCCs: string[][]) => {
        // Remove old SCC labels
        cynew.$(".CD-smell").forEach((ele) => {
            if (ele.data("labels")) {
                const newLabels = ele.data("labels").filter((l: string) => l !== "CD-smell")
                ele.data("labels", newLabels);
                ele.removeClass("CD-smell")
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
    
    removeModificationLabels(cy: cytoscape.Core) {
        const labelsToBeRemoved = ["New", "Modified"]
        labelsToBeRemoved.forEach((label) => {
            cy.$(label).forEach((ele) => {
                if (ele.data("labels")) {
                    const newLabels = ele.data("labels").filter((l: string) => l !== label)
                    ele.data("labels", newLabels);
                    ele.removeClass(label)
                    ele.removeClass("Expanded")
                }
            })
        })
    }
    
    previewRefactoring = async (ctx: Context, refactoring: RefactorSuggestion) => {
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
        const changeSet = this.getChangeSetForRefactoring(ctx.state.hcy, refactoring)
        statePreview.cy = cynew;
        statePreview.hcy = cynew;//ctx.state.hcy // TODO make hcy a clone of cynew o correct edgelabels can be derived in preview mode
        applyRefactoringChangeSet(statePreview.cy, changeSet, ctx.state)

        const scc = ctx.state.stronglyConnectedComponents[ctx.state.inspect.index]
        
        const SCCs = GraphService.getStronglyConnectedComponents(cynew) // should detect on unbundled edges (so before running visual pipeline like currently)
        this.updateSmellLabels(cynew, SCCs)
        const refactoringAnalyser = new RefactoringAnalyser(cynew, scc, SCCs)
        ctx.ui.renderRefactorDescription(refactoringAnalyser.analyseRefactoringResult(refactoring, changeSet))

        statePreview.stronglyConnectedComponents = SCCs;

        const visualPipeline = createVisualPipeline({ state: statePreview });
        ctx.cyAdapter.batch(cynew, () => {
            visualPipeline({ cy: cynew });
        });

        const inspect = this.inspectNodes([...scc, changeSet.focus], cynew)
        
        // shallow clone, error prone
        statePreview.inspect = {
            index: 0,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: inspect.nodes,
            expandNodes: Object.keys(statePreview.hiddenNodes['variables']).concat(Object.keys(statePreview.hiddenNodes['methods']))
        }
        
        const actionsPreview = createActions({state:statePreview, ui: ctx.ui})
        actionsPreview.initializePostRender(cynew, "#tab-preview");
        actionsPreview.setEdgeVisibilityPreset("#tab-preview", statePreview.cy, "class")

        cynew.once('layoutstop', () => cynew.animate({fit: {eles: inspect.fitElements}}));
    }

    getChangeSetForRefactoring = (graph: cytoscape.Core, refactoring: RefactorSuggestion) => {
        switch(refactoring.kind) {
            case "extract-interface":
                return (new ExtractInterfaceStrategy()).apply(graph, refactoring);
            case "dependency-injection":
                return (new DependencyInjectionStrategy()).apply(graph, refactoring);
            case "move-method":
                return (new MoveMethodStrategy()).apply(graph, refactoring);
            default:
                throw Error("No strategy found to apply refactoring of kind: " + refactoring);
        }
    }

    acceptRefactoring = async (ctx: Context, refactoring: RefactorSuggestion) => {
        const changeSet = this.getChangeSetForRefactoring(ctx.state.hcy, refactoring)
        applyRefactoringChangeSet(ctx.state.hcy, changeSet, ctx.state)
        
        // Either copy hcy into cy, or restore all edges (hidden and lifted) and apply changes to cy aswell (the latter is assumed to be more performative)
        ctx.state.inspect = null
        ctx.actions.restoreAllEdges("#tab-baseline")
        applyRefactoringChangeSet(ctx.state.cy, changeSet, ctx.state)
        
        this.detectCyclicDependencies(ctx)
        this.updateSmellLabels(ctx.state.cy, ctx.state.stronglyConnectedComponents)
        this.removeModificationLabels(ctx.state.hcy)
        this.removeModificationLabels(ctx.state.cy)

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
        ctx.actions.applyInitialColor(ctx.state.cy);
        ctx.actions.setEdgeVisibilityPreset('#tab-baseline', ctx.state.cy, 'calls')
        ctx.ui.renderDescription(refactoring.description, '#cycle-description', 'Accepted refactoring')
        this.listRefactorings(ctx)
        relayout(ctx.state.cy, ctx.ui.$('#selectlayout').options[ctx.ui.$('#selectlayout').selectedIndex].value);
        ctx.state.cy.once('layoutstop', () => ctx.state.cy.animate({fit: {eles: changeSet.focus}}));
    }

    inspectNodes = (nodes: string[], cy: cytoscape.Core) => {
        const fitElements = cy.nodes().filter((n) => nodes.includes(n.id()))
        const nodesChildren = cy.nodes().filter((n) =>nodes.includes(n.parent().first().id())).map((n) => n.id());
        return { fitElements, nodes: [...nodes, ...nodesChildren]}
    }
}
