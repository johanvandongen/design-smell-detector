import cytoscape from "cytoscape";
// @ts-ignore
import { ExtractInterfaceTransformation } from "./extractInterfaceTransformation.js";
import { ExtractInterfaceSuggestion } from "./refactorEngine.js";
import { IRefactoringStrategy, RefactoringChangeSet } from "./IRefactoringStrategy.js";

export class ExtractInterfaceStrategy implements IRefactoringStrategy<ExtractInterfaceSuggestion> {
    /** 
     * @param cy a source of truth graph with all original edges and nodes which queryable
     * Applies the refactoring and returns a changeset 
     * */
    apply(cy: cytoscape.Core, suggestion: ExtractInterfaceSuggestion): RefactoringChangeSet {
        return ExtractInterfaceTransformation.apply(cy, suggestion).changeSet;
    }
}
