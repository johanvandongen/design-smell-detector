import cytoscape from "cytoscape";
// @ts-ignore
import { edgeHasLabel, nodeHasKind } from '../utilities/utils.js';
import { IRefactoringStrategy, RefactoringChangeSet } from "./IRefactoringStrategy.js";
import { MoveMethodSuggestion } from "./moveMethodDetector.js";


export class MoveMethodStrategy implements IRefactoringStrategy<MoveMethodSuggestion> {
    
    /** 
     * @param cy a source of truth graph with all original edges and nodes which queryable
     * Applies the refactoring and returns a changeset 
     * */
    apply(cy: cytoscape.Core, suggestion: MoveMethodSuggestion): RefactoringChangeSet {
        const targetClass = cy.getElementById(suggestion.targetClass)
        const sourceClass = cy.getElementById(suggestion.sourceClass) 
        const method = cy.getElementById(suggestion.methodId)
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: method.id(),
            removeNodeIds: []
        };

        const methodNewId = targetClass.data("id") + method.data("properties.simpleName")
        refactoringChangeSet.removeNodeIds.push(method.id())
        refactoringChangeSet.addedNodes.push({
            id: methodNewId,
            label: method.data("label"), 
            labels: ["New", "Operation"],
            parent: targetClass.id(),
            name: method.data("name"),
            properties: {
                name: method.data("name"),
                shortname: method.data("shortname"),
                simpleName: method.data("simpleName"),
                kind: "method",
                sourceText: method.data("sourceText"),
                visibility: "public"
            }
        })
        
        
        // Add dependency edges to new method
        method.outgoers().forEach((edge) => {
            if (edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes") || edgeHasLabel(edge, "invokes") || edgeHasLabel(edge, "instantiates")) {
                refactoringChangeSet.addedEdges.push({
                    interaction: edge.data("interaction"),
                    group: "edges",
                    label: edge.data("label"),
                    labels: ["New"],
                    source: methodNewId,
                    target: edge.target().id()
                })
            }
        })
        // Remove self parameterizes edge once. 
        // We moved method to target class and added all the original edges to that, but the new self parameterize edge
        // is not needed, since we already have access to that object. A.method(b) becomes B.method(a)
        // (remove it once since original method can have multiple parameters of type targetclass)
        for (let i =0; i <refactoringChangeSet.addedEdges.length; i++) {
            const e = refactoringChangeSet.addedEdges[i]
            if (e.interaction === "parameterizes" && e.target === targetClass.id()) {
                refactoringChangeSet.addedEdges.splice(i, 1)
                break;
            }
        }
        refactoringChangeSet.addedEdges.push({
            interaction: "parameterizes",
            group: "edges",
            label: "parameterizes",
            labels: ["New"],
            source: methodNewId,
            target: sourceClass.id()
        })

        
        // Update composed edges between source class and target class
        const sourceClassOtherMethods = sourceClass.children().filter((child) => nodeHasKind(child, "method") && child.id() !== method.id());
        sourceClassOtherMethods.forEach((method) => {
            if (!method.outgoers().edges().some((edge) => edgeHasLabel(edge, "returns"))) {
                const returnEdgeId = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e, "returns(cls)") && e.target().id() === targetClass.id()).first().id();
                refactoringChangeSet.removeEdgeIds.push(returnEdgeId)
            }
            if (!method.outgoers().edges().some((edge) => edgeHasLabel(edge, "parameterizes"))) {
                const returnEdgeId = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e, "accepts") && e.target().id() === targetClass.id()).first().id();
                refactoringChangeSet.removeEdgeIds.push(returnEdgeId)
            }
            if (!method.outgoers().edges().some((edge) => edgeHasLabel(edge, "invokes"))) {
                const returnEdgeId = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e, "calls") && e.target().id() === targetClass.id()).first().id();
                refactoringChangeSet.removeEdgeIds.push(returnEdgeId)
            }
            if (!method.outgoers().edges().some((edge) => edgeHasLabel(edge, "instantiates"))) {
                const returnEdgeId = sourceClass.outgoers().edges().filter((e) => edgeHasLabel(e, "constructs") && e.target().id() === targetClass.id()).first().id();
                refactoringChangeSet.removeEdgeIds.push(returnEdgeId)
            }
        })


        method.incomers().edges().filter((e) => edgeHasLabel(e, "invokes")).forEach((edge) => {
            refactoringChangeSet.updatedNodes.push({id: edge.source().id(), newLabel: "Modified"})
            if (suggestion.newMethodReference === 'parameter') {
                refactoringChangeSet.addedEdges.push({
                    interaction: "invokes",
                    group: "edges",
                    label: "invokes",
                    source: edge.source().id(),
                    target: methodNewId
                })
            } else if (suggestion.newMethodReference === 'field') {
                // 'uses' edges not supported in json input model, so left out of scope for now
                // Add edges from edge.source() to sourceClass fields
                // const sourceField = 'some source field of type target class'
                // refactoringChangeSet.addedEdges.push({
                //     interaction: "uses",
                //     group: "edges",
                //     label: "invokes",
                //     source: edge.source().id(),
                //     target: sourceField
                // })
            }
        })

        return refactoringChangeSet
    }
}
