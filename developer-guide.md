Abbreviations and concept in project

cy = cytoscape
hcy = headless cytoscape (non-visual transformations)
scc = strongly connected component

input json -> graphPreprocessing -> headlesstransformation -> visual transformtion -> post processing.

input json has nodes and edges. Next to the codebase nodes and relationships, extra nodes such as dimension and category nodes are also present. These nodes are not part of the graph but are used for coloring and act as metadata


Two graph views. For terminology they are called: baseline and preview

Edges
*Composed
invokes -> calls
instantiates -> contructs
typed -> holds
parameterizes -> accepts
returns -> produces

*Structural
implements (interface)
specializes (inheritance)
succeeds?
nests?
uses?
CD-smell (edges between smell nodes)

We split the concept of detection into
- Code smell detection (detect cyclic dependency or feature envy etc)
- Refactoring opportunity detection (detect whether extract interface or move method is possible etc)


javapers json limitations
- Version 2 doesnt include information on primitive types (eg. whether a field is an array or int, it only accounts for custom types)
- Doesnt include instantiates edges for fields (eg. A.b = new B())
- Doesnt include methodBody details like whether it uses fields, assigns fields or super() calls (verion 2 does include uses fields edges from methods)

tool implication (due to javapers limitations)
- (MM) When a moved method uses a local field, the new method assumes it can access the field (assume public)
- (MM) assumes no super() calls, and checks for field assignments naivly (check for substring in sourceText)
- Instantiates edges added manually in tool




