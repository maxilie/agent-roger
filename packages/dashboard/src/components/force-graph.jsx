// @ts-nocheck
import { useState, useCallback, memo } from "react";
import { ForceGraph2D } from "react-force-graph";

const NODE_REL_SIZE = 2;

/**
 * props: {nodes, links, width: number, height: number, setSelectedTaskID: fn}
 */
const ForceGraph = (props) => {
  const [highlightNodeIDs, setHighlightNodeIDs] = useState(new Set());

  const updateHighlight = () => {
    setHighlightNodeIDs(highlightNodeIDs);
  };

  const selectSubtree = (node) => {
    highlightNodeIDs.clear();
    if (node) {
      highlightNodeIDs.add(node.id);
      node.descendentIDs.forEach((descendentID) =>
        highlightNodeIDs.add(descendentID)
      );
    }

    updateHighlight();
  };

  const isLinkHighlighted = useCallback(
    (link) => {
      if (highlightNodeIDs.size == 0) {
        return link.targetNode.isAbstract;
      }
      return (
        highlightNodeIDs.has(link.source.id) ||
        highlightNodeIDs.has(link.target.id)
      );
    },
    [highlightNodeIDs]
  );

  const getLinkColor = (link) => {
    if (link.targetNode.dead) {
      return highlightNodeIDs.has(link.source)
        ? "rgba(52, 58, 89, 1)"
        : "rgba(52, 58, 89, 0.8)";
    } else {
      return link.targetNode.isAbstract &&
        (highlightNodeIDs.has(link.source) || !highlightNodeIDs.size)
        ? "rgba(48, 54, 82, 0.77)"
        : "rgba(252, 254, 255, 0.1)";
    }
  };

  const getColor = (node) => {
    const borderColor = "rgba(255, 255, 255, 1)";
    const mutedBorderColor = "rgba(255, 255, 255, 0.3)";
    const whiteText = "rgba(250, 250, 250, 0.9)";
    const softText = "rgba(250, 250, 250, 0.7)";
    const verySoftText = "rgba(250, 250, 250, 0.5)";
    const darkText = "rgba(6, 10, 46, 1)";
    const softDarkText = "rgba(13, 43, 6, 0.6)";

    if (node.dead) {
      return highlightNodeIDs.has(node.id)
        ? ["rgba(29, 42, 66, 1)", "rgba(255, 255, 255, 0.7)", softText]
        : ["rgba(29, 42, 66, 1)", mutedBorderColor, verySoftText];
    }

    let nodeRgb =
      node.status == "success" ? "rgba(119, 240, 101, " : "rgba(84, 132, 227, ";
    let textColor = node.status == "success" ? darkText : whiteText;
    if (node.status == "failed") nodeRgb = "rgba(250, 7, 7, ";
    if (node.status == "paused") nodeRgb = "rgba(227, 170, 84, ";
    if (node.parentID == -1) nodeRgb = "rgba(242, 29, 207, ";
    if (highlightNodeIDs.has(node.id))
      return [nodeRgb + "1)", borderColor, textColor];
    if (highlightNodeIDs.size > 0 && !highlightNodeIDs.has(node.id))
      return [
        nodeRgb + "0.05)",
        mutedBorderColor,
        textColor == whiteText ? verySoftText : softDarkText,
      ];
    return [nodeRgb + "1)", borderColor, textColor];
  };

  const paintNode = useCallback(
    (node, ctx) => {
      const [color, borderColor, textColor] = getColor(node);
      const r = NODE_REL_SIZE;

      // circle for abstract tasks
      if (node.isAbstract) {
        ctx.beginPath();
        // innerRadius, outerRadius, startAngle, endAngle
        ctx.arc(node.x, node.y, r * 1.1, 0, 2 * Math.PI, false);
        ctx.fillStyle = borderColor;
        ctx.fill();
        ctx.beginPath();
        // innerRadius, outerRadius, startAngle, endAngle
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // triangle for execution tasks
      else if (node.isExecution) {
        const triangleR = r * 1;
        ctx.fillStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y - triangleR * 1.1);
        ctx.lineTo(node.x - triangleR * 1.1, node.y + triangleR * 1.1);
        ctx.lineTo(node.x + triangleR * 1.1, node.y + triangleR * 1.1);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y - triangleR);
        ctx.lineTo(node.x - triangleR, node.y + triangleR);
        ctx.lineTo(node.x + triangleR, node.y + triangleR);
        ctx.fill();
      }

      // square for other tasks
      else {
        const squareR = r * 1;
        ctx.fillStyle = borderColor;
        ctx.fillRect(
          node.x - squareR * 1.1,
          node.y - squareR * 1.1,
          squareR * 2 * 1.1,
          squareR * 2 * 1.1
        );
        ctx.fillStyle = color;
        ctx.fillRect(
          node.x - squareR,
          node.y - squareR,
          squareR * 2,
          squareR * 2
        );
      }

      // paint text (node's ranking of when it was created relative to its siblings)
      ctx.font = "2px sans-serif";
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        node.idxInSiblingGroup,
        node.x,
        node.y + (node.isExecution ? 0.6 : 0)
      );
    },
    [highlightNodeIDs]
  );

  return (
    <ForceGraph2D
      graphData={{ nodes: props.nodes, links: props.links }}
      dagMode={"radialin"}
      dagLevelDistance={30}
      autoPauseRedraw={true}
      nodeCanvasObject={paintNode}
      nodeId="id"
      nodeLabel="name"
      width={props.width}
      height={props.height}
      nodeRelSize={NODE_REL_SIZE}
      linkDirectionalParticleColor={() => "rgba(252, 254, 255, 0.77)"}
      linkDirectionalParticleSpeed={0.003}
      linkDirectionalParticles={1}
      linkDirectionalParticleWidth={(link) =>
        isLinkHighlighted(link) && !link.targetNode.dead ? 3 : 0
      }
      linkColor={(link) => getLinkColor(link)}
      linkWidth={(link) =>
        link.targetNode.isAbstract && !link.targetNode.dead ? 2 : 1
      }
      linkCurvature={0}
      d3AlphaMin={0.01}
      minZoom={0.7}
      maxZoom={10}
      warmupTicks={1000}
      onBackgroundClick={() => {
        selectSubtree(null);
        props.setSelectedTaskID(null);
      }}
      onNodeClick={(node) => {
        selectSubtree(node);
        props.setSelectedTaskID(node.id);
      }}
    />
  );
};

export default memo(ForceGraph, (prevProps, nextProps) => {
  return (
    prevProps.nodes.length == nextProps.nodes.length &&
    prevProps.links.length == nextProps.links.length &&
    (prevProps.nodes.length == 0 ||
      prevProps.nodes[0].id == nextProps.nodes[0].id)
  );
});
