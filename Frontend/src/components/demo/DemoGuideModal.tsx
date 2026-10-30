import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileCode2,
  Layers,
  Play,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_PROJECTS, loadDemoProject, type DemoProjectId } from '@/services/demoProjectService';

interface DemoGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProject?: DemoProjectId;
}

export function DemoGuideModal({ isOpen, onClose, defaultProject = 'user' }: DemoGuideModalProps) {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<DemoProjectId>(defaultProject);
  const [loading, setLoading] = useState(false);
  const [loadedProject, setLoadedProject] = useState<DemoProjectId | null>(null);

  if (!isOpen) return null;

  const currentMeta = DEMO_PROJECTS[selectedProject];

  const handleLoadProject = async (id: DemoProjectId) => {
    setLoading(true);
    try {
      await loadDemoProject(id);
      setLoadedProject(id);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (route: string) => {
    onClose();
    navigate(route);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 via-blue-50/40 to-indigo-50/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="demo-guide-title" className="text-lg font-bold text-slate-900">
                  APIForge Architecture & Verification Guide
                </h2>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  System Reference
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Step-by-step verification flows for User Management and QuickCart E-Commerce services
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close demo guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Project Selector Bar */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Project 1 Button Card */}
            <div
              onClick={() => setSelectedProject('user')}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                selectedProject === 'user'
                  ? 'border-sky-500 bg-sky-50/70 shadow-sm ring-1 ring-sky-400'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white font-bold text-xs">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Project 1: User Management Service</h3>
                    <p className="text-[11px] text-slate-500">Identity & RBAC Service (Aarav Patil, ID: 101)</p>
                  </div>
                </div>
                {loadedProject === 'user' && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3 text-sky-600" /> Loaded
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">5 Endpoints • CRUD + Teardown</span>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleLoadProject('user');
                  }}
                  disabled={loading}
                  className="h-7 text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white gap-1 rounded-lg"
                >
                  <Zap className="h-3 w-3" />
                  Load Workspace
                </Button>
              </div>
            </div>

            {/* Project 2 Button Card */}
            <div
              onClick={() => setSelectedProject('ecommerce')}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                selectedProject === 'ecommerce'
                  ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-400'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Project 2: QuickCart Store Service</h3>
                    <p className="text-[11px] text-slate-500">E-Commerce, Inventory & Order Tracking</p>
                  </div>
                </div>
                {loadedProject === 'ecommerce' && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Loaded
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">6 Endpoints • Store & Checkout</span>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleLoadProject('ecommerce');
                  }}
                  disabled={loading}
                  className="h-7 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 rounded-lg"
                >
                  <Zap className="h-3 w-3" />
                  Load Workspace
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature-by-Feature Guided Walkthrough (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                10-Feature Verification Flow ({currentMeta.title})
              </h4>
              <p className="text-xs text-slate-500">
                Systematic feature verification sequence for code walkthroughs and faculty evaluation.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleLoadProject(selectedProject)}
              disabled={loading}
              className="h-8 gap-1.5 text-xs font-semibold rounded-lg"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              Reload Spec & Routes
            </Button>
          </div>

          <div className="space-y-3">
            {currentMeta.steps.map((step) => (
              <div
                key={step.featureNumber}
                className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:bg-blue-50/20 transition-all shadow-xs"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-blue-600 group-hover:text-white font-bold text-xs text-slate-700 transition-colors">
                    {step.featureNumber}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900">{step.title}</span>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                        {step.route}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                        {step.keyMetric}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      <strong>Action:</strong> {step.actionText}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      <strong>Outcome:</strong> {step.expectedResult}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNavigate(step.route)}
                  className="shrink-0 h-8 text-xs font-semibold gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 rounded-lg"
                >
                  Open {step.title.split(' ')[0]}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer with Postman Comparison Highlight */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <span>
              <strong>Presentation Tip:</strong> Highlight that APIForge automatically generated these 10 features directly from OpenAPI contracts without writing manual scripts.
            </span>
          </div>
          <Button onClick={onClose} size="sm" className="h-8 px-4 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white">
            Close Guide
          </Button>
        </div>
      </div>
    </div>
  );
}

