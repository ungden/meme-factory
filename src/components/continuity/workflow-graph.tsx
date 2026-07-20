"use client";

import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { CheckCircleIcon, CodeIcon, DatabaseIcon, GitBranchIcon, ImageIcon, MagicWandIcon } from "@phosphor-icons/react";

type WorkflowNodeData = { label: string; detail: string; tone: "cyan" | "violet" | "blue" | "green" | "amber"; icon: string };

const iconMap = {
  database: DatabaseIcon,
  branch: GitBranchIcon,
  code: CodeIcon,
  magic: MagicWandIcon,
  check: CheckCircleIcon,
  image: ImageIcon,
};

function WorkflowNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const Icon = iconMap[data.icon as keyof typeof iconMap] ?? CodeIcon;
  return (
    <div className={`flow-node flow-${data.tone}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flow-icon"><Icon size={17} weight="duotone" /></div>
      <div><strong>{data.label}</strong><span>{data.detail}</span></div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };
const nodes: Node<WorkflowNodeData>[] = [
  { id: "assets", type: "workflow", position: { x: 40, y: 180 }, data: { label: "Phân giải tài nguyên", detail: "9 ảnh chuẩn đã khóa", tone: "cyan", icon: "database" } },
  { id: "router", type: "workflow", position: { x: 285, y: 180 }, data: { label: "Định tuyến tham chiếu", detail: "9/14 ảnh", tone: "violet", icon: "branch" } },
  { id: "prompt", type: "workflow", position: { x: 530, y: 180 }, data: { label: "Biên dịch chỉ đạo", detail: "Hồ sơ Gemini", tone: "blue", icon: "code" } },
  { id: "provider", type: "workflow", position: { x: 775, y: 180 }, data: { label: "Mô hình tạo ảnh", detail: "Nano Banana 2", tone: "green", icon: "magic" } },
  { id: "check", type: "workflow", position: { x: 1020, y: 100 }, data: { label: "Kiểm tra nhất quán", detail: "4 nhóm quy tắc", tone: "amber", icon: "check" } },
  { id: "persist", type: "workflow", position: { x: 1020, y: 260 }, data: { label: "Lưu phiên bản", detail: "Ảnh đầu ra bất biến", tone: "green", icon: "image" } },
];

const edges: Edge[] = [
  { id: "e1", source: "assets", target: "router", animated: true },
  { id: "e2", source: "router", target: "prompt", animated: true },
  { id: "e3", source: "prompt", target: "provider", animated: true },
  { id: "e4", source: "provider", target: "check", animated: true },
  { id: "e5", source: "provider", target: "persist", animated: true },
];

export function WorkflowGraph() {
  return (
    <div className="workflow-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.55} maxZoom={1.5} proOptions={{ hideAttribution: true }}>
        <Background gap={20} size={1} color="#242a36" />
        <MiniMap pannable zoomable nodeColor="#324055" maskColor="rgba(8, 10, 14, .72)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
