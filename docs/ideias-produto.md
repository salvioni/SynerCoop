# Ideias de produto — para validar com o stakeholder

Anotações de direção do produto para validar. As duas primeiras são propostas
ainda **não implementadas**; a terceira **já está no ar** e o que se pede é o
aval sobre a metodologia. Cada uma traz o problema que resolve, o motivo de
parecer valiosa e o que ela custa, para a conversa acontecer sobre fatos e não
sobre impressões.

---

## 1. Preencher o Balanço Perguntado dentro do sistema

**Situação hoje:** o sistema só funciona a partir de um documento. Se a pessoa
não tem o Balanço Perguntado já preenchido (ou um balanço em PDF), não há
por onde começar — a tela de Nova análise exige um arquivo.

**A observação:** o Balanço Perguntado não é uma planilha de números, é um
**questionário**. As abas A.01 a C.10 são perguntas escritas em português:

> "Qual o valor de títulos (duplicatas, boletos, cheques) a receber da
> Cooperativa, com atos cooperados, vencidos ou a vencer?"
>
> "Qual o valor das perdas estimadas de curto e longo prazo da cooperativa?"

O modelo já traz a pergunta ao lado de cada campo (coluna I das abas de
detalhe). Ou seja: o roteiro de coleta já existe e está estruturado.

**A ideia:** oferecer esse questionário como formulário guiado na tela. A pessoa
responde as perguntas que souber, o sistema monta o BP e a DSP a partir das
respostas (mesma lógica de agregação que hoje lê as células), calcula os
indicadores e entrega o Excel preenchido no fim.

**Por que parece importante:** muda a natureza do produto. Hoje ele é um
conversor — pega uma planilha pronta e devolve análise. Com isso ele passa a ser
o lugar onde o trabalho é feito, e atende quem ainda não tem os dados
organizados. Uma cooperativa pequena, sem contabilidade estruturada, é
exatamente quem mais precisa da análise e hoje é quem menos consegue usar.

**Custo:** é a maior das duas. São ~23 abas de perguntas para transformar em
formulário. Dá para começar por um subconjunto (as abas que alimentam os campos
mais usados) e evoluir. A agregação BP/DSP já está escrita em
`extractFromStandardExcel` e pode ser reaproveitada.

**A decidir:** vale como produto separado ("montar meu balanço") ou como terceiro
caminho na tela de Nova análise, ao lado de PDF e Excel?

---

## 2. Um Excel com vários períodos

**Situação hoje:** o modelo tem uma coluna de exercício só (`BP!E2` alimenta os
cabeçalhos de todas as abas). Cada análise gera um arquivo isolado. Quem
acompanha uma cooperativa ao longo do tempo baixa N planilhas e compara na mão.

**A ideia:** exportar um único Excel com uma coluna por período analisado —
mantendo as fórmulas do modelo, mas replicadas lado a lado — ou uma aba de
comparativo que puxe os indicadores de cada período.

**Por que parece importante:** a análise horizontal (evolução entre períodos) é
metade da metodologia clássica de análise de balanço. O sistema já mostra isso
na tela do cliente; o que sai em arquivo continua sendo só o retrato de um
período. Quem leva o material para uma reunião ou para o conselho leva a metade
mais fraca.

**Custo:** menor que a primeira, mas não trivial. As fórmulas do modelo usam
referências fixas de célula (`BP!$E$8`), então replicar por coluna exige
reescrever as referências ou gerar uma aba de comparativo nova, alimentada com
valores já calculados — este segundo caminho é bem mais simples e provavelmente
suficiente.

**A decidir:** comparativo como aba extra no mesmo arquivo, ou exportação
separada ("comparativo de períodos")?

---

## 3. Anualização dos indicadores — **já implementado, validar metodologia**

Diferente das duas anteriores: esta **está no ar**, mas é decisão de metodologia
e precisa do aval de quem responde pelo modelo.

**O problema.** O balanço é um saldo numa data; a DSP é um acumulado do período.
Todo indicador que divide um pelo outro — PMR, PME, PMP, ciclos, giros, ROE, ROA,
Dívida/EBITDA — pressupõe que o acumulado cobre um ano, que é o que as fórmulas
do modelo assumem ao multiplicar por 360.

Com um período menor, o resultado se distorce proporcionalmente. Medido com o
mesmo balanço, mudando só o período da receita:

| | Ano | Janeiro (antes) |
|---|---|---|
| PMR | 60 dias | 720 dias |
| Giro do Ativo | 2,00 | 0,17 |
| ROE | 33,3% | 2,8% |
| Margem líquida | 10,0% | 10,0% |

Os três primeiros erram por exatamente 12×. A margem não se mexe porque compara
fluxo com fluxo — as duas pontas se cancelam.

**O que passou a ser feito.** O fluxo é levado à base anual antes de entrar
nessas razões (×12 para mês, ×4 para trimestre, ×2 para semestre). Isso corrige
o valor absoluto e, de quebra, torna períodos de tamanhos diferentes
comparáveis entre si. Ficam intactos os valores absolutos (EBITDA e Sobras
continuam sendo os do período) e as razões fluxo÷fluxo.

Na tela, os indicadores anualizados levam o selo **a.a.** e há uma linha
explicando que aquilo é o ritmo do período projetado para 12 meses, não o
realizado.

**A ressalva que o stakeholder precisa avaliar.** Anualizar é projetar. Numa
cooperativa com receita concentrada na safra, anualizar o trimestre forte diz
que o ano será excelente — e não será. A alternativa considerada foi travar o
tipo de período por cliente (o primeiro arquivo definiria mensal/trimestral/anual
e os seguintes teriam de seguir), mas ela não corrige o cálculo: um cliente
só-mensal continuaria com PMR 12× inflado. Ficaria consistente e errado.

**A decidir:** manter a anualização como está, exibir os dois números (período e
anualizado), ou restringir os períodos sub-anuais a um conjunto menor de
indicadores — os que não dependem de anualização.

---

## Contexto que ajuda na conversa

- A paridade entre o que a tela mostra e o que o Excel calcula foi verificada
  indicador a indicador: **35 dos 37 batem**. As duas exceções (PMP e Ciclo
  Financeiro) são divergências deliberadas — o modelo tem o sinal invertido no
  denominador do PMP, o que produz "prazo de pagamento negativo" e, por
  consequência, infla o Ciclo Financeiro. O sistema mantém o valor
  correto. **Se a metodologia for revisada, é este ponto que muda.**
- A inadimplência é derivada da aba A.02 (perdas estimadas ÷ total a receber),
  não digitada — tanto no caminho do modelo padrão quanto na extração por IA.
