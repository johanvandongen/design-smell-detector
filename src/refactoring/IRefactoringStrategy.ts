import cytoscape from "cytoscape";
import { RefactorSuggestion } from "./refactorEngine";
import { NodeData, EdgeData, composedEdgesMap, edgeIsComposed, composedInteractions } from "../graphPreProcessing/graphPreprocessor";
// @ts-ignore
import { nodeHasLabel, edgeHasLabel } from '../utilities/utils.js';

export interface RefactoringChangeSet {
    addedNodes: NodeData[];
    addedEdges: EdgeData[];

    removeEdgeIds: string[];
    removeEdges: EdgeData[];
    removeNodeIds: string[];

    updatedNodes: EdgeUpdate[];
    focus: string;
    description?: string;
}

interface EdgeUpdate {
    id: string;
    newLabel: string;
}

export abstract class IRefactoringStrategy<T extends RefactorSuggestion> {
    /** Returns -1 if the edge was already removed, 0 if the edge was removed and 1 if the edge and its composed version was removed */
    static removeEdge(changeSet: RefactoringChangeSet, egde: cytoscape.EdgeSingular): number {
        if (changeSet.removeEdges.map((e) => e.id).includes(egde.id())) {
            return -1;
        }
        changeSet.removeEdges.push({
            interaction: egde.data("interaction"),
            group: "edges",
            id: egde.id(),
            label: egde.data("label"),
            source: egde.source().id(),
            target: egde.target().id()
        })

        // Remove composed edge if possible
        const sourceClass = nodeHasLabel(egde.source(), "Type") ? egde.source() : egde.source().parent().first()
        const targetClass = nodeHasLabel(egde.target(), "Type") ? egde.target() : egde.target().parent().first()
        const removedEdgesIds = new Set(changeSet.removeEdges.map((e) => e.id))
        const interactionStillExists = sourceClass.children().outgoers().edges().filter((e) => !removedEdgesIds.has(e.id()) && edgeHasLabel(e, egde.data("interaction")) && e.target().id() === targetClass.id()).length > 0
        if (!interactionStillExists) {
            const composedEdge = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e,composedEdgesMap[egde.data("interaction")]) && e.target().id() === targetClass.id()).edges().first();
            if (composedEdge.length === 0) {return 0;}
            IRefactoringStrategy.removeEdge(changeSet, composedEdge)
            return 1;
        }
        return 0
    }

    /** 
     * Adds directed edge between source and target and composed edge between sourceClass and targetClass
     * @param sourceClass parent class of source
     * */
    static addEdgeInteraction(cy: cytoscape.Core, changeSet: RefactoringChangeSet, interaction: string, source: string, sourceClass: string, target: string, targetClass: string) {
        if (source && target) {
            const id = source + "-" + interaction + "-" + target
            changeSet.addedEdges.push({
                id: id,
                interaction: interaction,
                group: "edges",
                label: interaction,
                source: source,
                target: target,
                properties: {
                    weigth: 1
                }
            })
        }

        if (composedInteractions.includes(interaction)) {
            return;
        }

        // Add composed edge
        if (!Object.hasOwn(composedEdgesMap, interaction)) {
            throw Error ("unknown interaction")
        }
        
        // No self composed edges
        if (sourceClass === targetClass) {
            return
        }
        const classLevelInteraction: string = composedEdgesMap[interaction]
        const newEdgeId = sourceClass + "-" + classLevelInteraction + "-" + targetClass;
        const sourceCy = cy.getElementById(sourceClass)
        const targetCy = cy.getElementById(sourceClass)
        const composedEdgeAlreadyInGraph = sourceCy && targetCy && cy.edges().filter((e) => e.source().id() === sourceClass && e.target().id() === targetClass).length > 0
        if (!changeSet.addedEdges.some((e) => e.id === newEdgeId) && !composedEdgeAlreadyInGraph) {
            changeSet.addedEdges.push({
                id: newEdgeId,
                interaction: classLevelInteraction,
                group: "edges",
                label: classLevelInteraction,
                source: sourceClass,
                target: targetClass,
                properties: {
                    weight: 1
                }
            })
            // changeSet.description += `Added ${sourceCy ? sourceCy.data("properties.simpleName") : sourceClass} ${classLevelInteraction} ${targetCy ? targetCy.data("properties.simpleName") : targetClass}`
        }
    }

    static addEdge(cy: cytoscape.Core, changeSet: RefactoringChangeSet, edge: cytoscape.SingularElementReturnValue | cytoscape.EdgeSingular, source: string, sourceClass: string, target: string, targetClass: string) {
        IRefactoringStrategy.addEdgeInteraction(cy, changeSet, edge.data("interaction"), source, sourceClass, target, targetClass)
    }

    abstract apply(graph: cytoscape.Core, suggestion: T): RefactoringChangeSet;
}