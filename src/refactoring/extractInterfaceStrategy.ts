import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasKind, edgeHasLabel } from '../utilities/utils.js';
import { EdgeData, NodeData } from "../graphPreProcessing/graphPreprocessor.js";

export interface RefactoringChangeSet {
    addedNodes: NodeData[];
    addedEdges: EdgeData[];

    removeEdgeIds: string[];

    updatedNodes: EdgeUpdate[];
    focus: string;
}

interface EdgeUpdate {
    id: string;
    newLabel: string;
}

export class ExtractInterfacetrategy {
    private targetClass: string;

    constructor(targetClass: string) {
        this.targetClass = targetClass
    }
    
    /** 
     * @param cy a source of truth graph with all original edges and nodes which queryable
     * Applies the refactoring and returns a changeset 
     * */
    apply(cy: cytoscape.Core): RefactoringChangeSet {
        
        const targetNode = cy.getElementById(this.targetClass) // target node is the class which we want an interface for
        targetNode.data("labels").push("Modified")

        const newInterfaceId = "I" + targetNode.data("label") + "<<Interface>>"
        
        const refactoringChangeSet: RefactoringChangeSet = {
            addedNodes: [], addedEdges: [], updatedNodes: [],
            removeEdgeIds: [], focus: newInterfaceId
        };

        refactoringChangeSet.addedNodes.push({parent: targetNode.parent().first().id(), id: newInterfaceId, label: newInterfaceId,  name: newInterfaceId, labels: ["Type", "New"], properties: { "type": "interface", "kind": "class", "simpleName": "Int", "name": "name", "shortname": "name"}})
        refactoringChangeSet.addedEdges.push({
            source: targetNode.id(), target: newInterfaceId, label: 'myInterface', labels: ["New"],
            interaction: "",
            group: ""
        })
        
        // Add original methods to interface
        const originalClassMethods = targetNode.children().filter((child) => nodeHasKind(child, "method"));
        originalClassMethods.forEach((node) => 
            {
                const newId = newInterfaceId + node.id();
                const label = node.data("label")
                refactoringChangeSet.addedNodes.push({ parent: newInterfaceId, id: newId, label: label,  name: label, labels: ["Operation", "New"], properties: {
                    "kind": "method", "simpleName": label,
                    name: "",
                    shortname: ""
                } })
            });

        // Modify edges (redirect edges to interface)
        targetNode.incomers().forEach((edge) => {
            if (edge.source().id()) {
                if (edgeHasLabel(edge, "typed") || edgeHasLabel(edge, "returns") || edgeHasLabel(edge, "parameterizes")) {
                    refactoringChangeSet.addedEdges.push({
                        source: edge.source().id(), target: newInterfaceId, label: edge.data("label"), labels: ["New"],
                        interaction: "",
                        group: ""
                    })
                    refactoringChangeSet.updatedNodes.push({
                        id: edge.source().id(),
                        newLabel: "Modified"
                    })
                    refactoringChangeSet.updatedNodes.push({
                        id: edge.target().id(),
                        newLabel: "Modified"
                    })
                    refactoringChangeSet.removeEdgeIds.push(edge.id());
                }
            }
        })

        console.log(refactoringChangeSet)
        return refactoringChangeSet
    }
}
