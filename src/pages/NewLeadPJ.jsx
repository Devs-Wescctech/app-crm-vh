import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuickLeadPJForm from "../components/sales/QuickLeadPJForm";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewLeadPJ() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("LeadsPJKanban"))}
              className="hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                Novo Lead PJ
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Cadastre uma nova empresa no pipeline B2B
              </p>
            </div>
          </div>
        </div>

        <Card className="bg-white dark:bg-gray-900 shadow-lg">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle className="text-gray-900 dark:text-gray-100">
              Dados da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <QuickLeadPJForm
              onSuccess={() => navigate(createPageUrl("LeadsPJKanban"))}
              onCancel={() => navigate(createPageUrl("LeadsPJKanban"))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}