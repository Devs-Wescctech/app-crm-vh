import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle, TrendingUp, Users, DollarSign, Target, Activity, Clock, CheckCircle, Gift, Building2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const metricsInfo = {
  sales: {
    title: "Vendas PF - Explicação das Métricas",
    description: "Como os dados do dashboard de Vendas PF são calculados",
    metrics: [
      {
        icon: Users,
        name: "Total de Leads",
        description: "Quantidade total de leads cadastrados no período selecionado.",
        calculation: "Contagem de todos os registros na tabela de leads que correspondem aos filtros aplicados."
      },
      {
        icon: TrendingUp,
        name: "Leads Novos",
        description: "Leads que ainda não foram abordados.",
        calculation: "Contagem de leads com stage = 'novo'"
      },
      {
        icon: Target,
        name: "Leads Qualificados",
        description: "Leads que passaram pela qualificação e têm potencial de conversão.",
        calculation: "Contagem de leads com stage = 'qualificado'"
      },
      {
        icon: CheckCircle,
        name: "Vendas Fechadas",
        description: "Leads que foram convertidos em vendas.",
        calculation: "Contagem de leads com stage = 'fechado_ganho'"
      },
      {
        icon: Activity,
        name: "Taxa de Conversão",
        description: "Percentual de leads que se tornaram vendas.",
        calculation: "(Vendas Fechadas / Total de Leads) × 100"
      },
      {
        icon: DollarSign,
        name: "Valor Total Potencial",
        description: "Soma dos valores estimados de todos os leads ativos.",
        calculation: "Soma do campo 'estimated_value' de leads que não estão perdidos."
      },
      {
        icon: Clock,
        name: "Atividades Pendentes",
        description: "Quantidade de atividades agendadas ainda não realizadas.",
        calculation: "Contagem de atividades com status = 'pendente' e data >= hoje"
      }
    ]
  },
  sales_pj: {
    title: "Vendas PJ - Explicação das Métricas",
    description: "Como os dados do dashboard de Vendas PJ são calculados",
    metrics: [
      {
        icon: Building2,
        name: "Total de Leads PJ",
        description: "Quantidade total de leads empresariais cadastrados.",
        calculation: "Contagem de todos os registros na tabela leads_pj que correspondem aos filtros."
      },
      {
        icon: TrendingUp,
        name: "Leads Novos",
        description: "Empresas que ainda não foram contatadas.",
        calculation: "Contagem de leads PJ com stage = 'novo'"
      },
      {
        icon: Target,
        name: "Leads Qualificados",
        description: "Empresas qualificadas com potencial de fechamento.",
        calculation: "Contagem de leads PJ com stage = 'qualificado'"
      },
      {
        icon: CheckCircle,
        name: "Contratos Fechados",
        description: "Leads PJ convertidos em contratos ativos.",
        calculation: "Contagem de leads PJ com stage = 'fechado_ganho'"
      },
      {
        icon: Activity,
        name: "Taxa de Conversão B2B",
        description: "Percentual de leads PJ que se tornaram contratos.",
        calculation: "(Contratos Fechados / Total de Leads PJ) × 100"
      },
      {
        icon: DollarSign,
        name: "Valor Total de Contratos",
        description: "Soma dos valores de contratos fechados.",
        calculation: "Soma do campo 'estimated_value' de leads PJ com stage = 'fechado_ganho'"
      }
    ]
  },
  referral: {
    title: "Indicações - Explicação das Métricas",
    description: "Como os dados do dashboard de Indicações são calculados",
    metrics: [
      {
        icon: Gift,
        name: "Total de Indicações",
        description: "Quantidade total de indicações recebidas.",
        calculation: "Contagem de todos os registros na tabela referrals que correspondem aos filtros."
      },
      {
        icon: Users,
        name: "Indicações Novas",
        description: "Indicações ainda não trabalhadas.",
        calculation: "Contagem de indicações com stage = 'novo'"
      },
      {
        icon: Target,
        name: "Propostas Enviadas",
        description: "Indicações com propostas enviadas.",
        calculation: "Contagem de indicações com stage = 'proposta_enviada'"
      },
      {
        icon: CheckCircle,
        name: "Convertidas",
        description: "Indicações que se tornaram clientes.",
        calculation: "Contagem de indicações com stage = 'fechado_ganho'"
      },
      {
        icon: Activity,
        name: "Taxa de Conversão",
        description: "Percentual de indicações convertidas em clientes.",
        calculation: "(Convertidas / Total de Indicações) × 100"
      },
      {
        icon: DollarSign,
        name: "Comissões a Pagar",
        description: "Total de comissões pendentes de pagamento aos indicadores.",
        calculation: "Soma das comissões de indicações convertidas com commission_status = 'pending'"
      },
      {
        icon: DollarSign,
        name: "Comissões Pagas",
        description: "Total de comissões já pagas aos indicadores.",
        calculation: "Soma das comissões de indicações com commission_status = 'paid'"
      }
    ]
  },
  my_dashboard: {
    title: "Meu Dashboard - Explicação das Métricas",
    description: "Como os dados do seu dashboard pessoal são calculados. Todos os dados exibidos são filtrados para mostrar apenas seus registros (agent_id = seu ID).",
    metrics: [
      {
        icon: Users,
        name: "Leads PF (Vendas Pessoa Física)",
        description: "Leads individuais atribuídos exclusivamente a você.",
        calculation: "Busca leads onde agent_id = seu ID. Quando o filtro de período é diferente de 'Todo período', filtra por createdAt dentro do intervalo de datas selecionado. O valor é obtido do campo 'value'."
      },
      {
        icon: Building2,
        name: "Leads PJ (Vendas Pessoa Jurídica)",
        description: "Leads empresariais atribuídos exclusivamente a você.",
        calculation: "Busca leads_pj onde agent_id = seu ID. Quando o filtro de período é diferente de 'Todo período', filtra por createdAt. O valor usa fallback: value → monthlyValue → monthly_value → monthlyRevenue → monthly_revenue (primeiro disponível)."
      },
      {
        icon: Gift,
        name: "Indicações",
        description: "Indicações atribuídas exclusivamente a você para trabalhar.",
        calculation: "Busca referrals onde agent_id = seu ID. Filtra por createdAt quando período selecionado. Valor usa fallback similar ao PJ. Comissão total = soma de commissionValue ou commission_value de todas as indicações."
      },
      {
        icon: CheckCircle,
        name: "Ganhos (por módulo)",
        description: "Quantidade de leads/indicações fechados com sucesso em cada módulo.",
        calculation: "Contagem separada para PF, PJ e Indicações de registros com stage = 'fechado_ganho' dentro do período filtrado. Exibido individualmente em cada card."
      },
      {
        icon: DollarSign,
        name: "Valor Ganho (Total)",
        description: "Soma dos valores de vendas fechadas de PF + PJ.",
        calculation: "PF: soma do campo 'value' de leads com stage = 'fechado_ganho'. PJ: soma do valor (usando fallback value/monthly_value/monthlyValue/monthly_revenue) de leads_pj com stage = 'fechado_ganho'. Total = PF + PJ."
      },
      {
        icon: DollarSign,
        name: "Pipeline (Valor em Aberto)",
        description: "Soma dos valores de leads ativos que ainda estão em negociação.",
        calculation: "Soma dos valores de leads PF e PJ onde stage NÃO é 'fechado_ganho' nem 'fechado_perdido', filtrados pelo período selecionado."
      },
      {
        icon: Activity,
        name: "Taxa de Conversão (por módulo)",
        description: "Percentual de conversão calculado separadamente para cada módulo.",
        calculation: "PF: (Ganhos PF / Total PF) × 100. PJ: (Ganhos PJ / Total PJ) × 100. Indicações: (Convertidas / Total Indicações) × 100. Cada módulo exibe sua própria taxa."
      },
      {
        icon: Clock,
        name: "Atividades Pendentes Hoje",
        description: "Tarefas agendadas para hoje ainda não concluídas.",
        calculation: "Contagem de atividades onde: scheduled_at = data de hoje E completed = false. Inclui atividades vinculadas aos seus leads OU onde você é assignedTo OU createdBy."
      },
      {
        icon: Clock,
        name: "Atividades Atrasadas",
        description: "Tarefas não concluídas com data no passado.",
        calculation: "Contagem de atividades onde: scheduled_at < hoje (e não é hoje) E completed = false. Mesma regra de vínculo: seus leads, assignedTo ou createdBy."
      },
      {
        icon: Target,
        name: "Visitas (Este Mês)",
        description: "Atividades do tipo 'visita' agendadas no mês atual.",
        calculation: "Contagem de atividades onde type = 'visit' e scheduled_at está entre o primeiro e último dia do mês corrente, vinculadas aos seus leads. Mostra também total de visitas realizadas (completed = true) e agendadas."
      }
    ]
  }
};

const visibilityInfo = {
  title: "Visibilidade dos Dados",
  description: "Como funciona a permissão de visualização",
  rules: [
    {
      role: "Administrador",
      access: "Visualiza todos os dados de todos os vendedores e equipes."
    },
    {
      role: "Supervisor",
      access: "Visualiza todos os dados da sua equipe e pode acessar dados de outras equipes conforme configuração."
    },
    {
      role: "Vendedor",
      access: "Visualiza apenas os próprios leads e indicações, a menos que tenha permissão especial de equipe."
    }
  ]
};

export default function MetricsHelpDialog({ type = "sales", children }) {
  const info = metricsInfo[type] || metricsInfo.sales;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            Como funciona?
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            {info.title}
          </DialogTitle>
          <DialogDescription>
            {info.description}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
                Métricas do Dashboard
              </h3>
              <div className="space-y-4">
                {info.metrics.map((metric, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-2 rounded-md bg-primary/10">
                        <metric.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{metric.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {metric.description}
                        </p>
                        <div className="mt-2 p-2 bg-background rounded border text-xs font-mono">
                          <span className="text-muted-foreground">Cálculo: </span>
                          {metric.calculation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
                {visibilityInfo.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {visibilityInfo.description}
              </p>
              <div className="space-y-3">
                {visibilityInfo.rules.map((rule, index) => (
                  <div key={index} className="flex gap-3 items-start border rounded-lg p-3">
                    <div className="font-medium text-sm min-w-[100px]">{rule.role}</div>
                    <div className="text-sm text-muted-foreground">{rule.access}</div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <strong>Importante:</strong> Os filtros aplicados (período, vendedor, etapa) afetam todos os cálculos exibidos no dashboard. 
              Certifique-se de verificar os filtros ativos para entender corretamente os dados apresentados.
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
