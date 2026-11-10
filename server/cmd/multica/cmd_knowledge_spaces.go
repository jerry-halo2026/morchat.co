package main

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

func runKnowledgeSpacesList(cmd *cobra.Command, _ []string) error {
	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.get(knowledgePath("spaces"))
	if err != nil {
		return err
	}
	rows, err := knowledgeArray(raw, "spaces")
	if err != nil {
		return err
	}

	spaces := make([]knowledgeSpace, 0, len(rows))
	for _, row := range rows {
		spaces = append(spaces, knowledgeSpaceFrom(row))
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, spaces)
	}
	if len(spaces) == 0 {
		// An empty list from a real endpoint is not the same as a missing
		// endpoint: knowledgeNotServed already exited 2 before we got here.
		cli.PrintTable(os.Stdout, []string{"ID", "NAME", "ITEMS", "CREATED_AT"}, nil)
		return nil
	}
	tableRows := make([][]string, 0, len(spaces))
	for _, space := range spaces {
		tableRows = append(tableRows, []string{
			space.ID,
			space.Name,
			knowledgeIntOrDash(space.ItemCount),
			space.CreatedAt,
		})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "NAME", "ITEMS", "CREATED_AT"}, tableRows)
	return nil
}

func runKnowledgeSpacesCreate(cmd *cobra.Command, _ []string) error {
	name, err := knowledgeRequireFlag(cmd, "name")
	if err != nil {
		return err
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	body := map[string]any{"name": name}
	if description := flagString(cmd, "description"); description != "" {
		body["description"] = description
	}

	raw, err := api.post(knowledgePath("spaces"), body)
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	space := knowledgeSpaceFrom(object)

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, space)
	}
	printKnowledgeObject([][2]string{
		{"ID", space.ID},
		{"NAME", space.Name},
		{"DESCRIPTION", space.Description},
		{"CREATED_AT", space.CreatedAt},
	})
	return nil
}
